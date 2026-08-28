<?php

namespace Database\Seeders;

use App\Models\Disease;
use App\Models\ResearchSource;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;

class ScientificKnowledgeSeeder extends Seeder
{
    private CarbonImmutable $reviewedAt;

    public function run(): void
    {
        if (app()->environment('production')) {
            $this->command?->warn('Development scientific knowledge was not seeded in production.');

            return;
        }

        $this->reviewedAt = CarbonImmutable::parse('2026-08-14 00:00:00', 'Asia/Manila');
        $sources = $this->seedSources();
        $reviewer = User::query()->where('email', 'reviewer@dahonmd.test')->first();

        foreach ($this->diseases() as $record) {
            $symptoms = $record['symptom_records'];
            $management = $record['management_records'];
            $evidence = $record['evidence'];
            $regulatoryCheck = $record['regulatory_check'] ?? null;
            $verificationStatus = $record['verification_status'] ?? 'verified';
            $isVerified = $verificationStatus === 'verified';
            unset($record['symptom_records'], $record['management_records'], $record['evidence'], $record['regulatory_check'], $record['verification_status']);
            $record['symptoms'] = array_values(array_filter(array_column($symptoms, 'farmer_friendly_text')));

            $disease = Disease::query()->updateOrCreate(
                ['slug' => $record['slug']],
                [
                    ...$record,
                    'verification_status' => $verificationStatus,
                    'is_verified' => $isVerified,
                    'last_reviewed_at' => $isVerified ? $this->reviewedAt : null,
                    'verified_at' => $isVerified ? $this->reviewedAt : null,
                    'verified_by' => $isVerified ? $reviewer?->id : null,
                ],
            );

            $symptomIds = [];
            foreach ($symptoms as $symptom) {
                $symptomRecord = $disease->symptomRecords()->updateOrCreate(
                    ['stage' => $symptom['stage'], 'plant_part' => $symptom['plant_part'], 'sort_order' => $symptom['sort_order']],
                    $symptom,
                );
                $symptomIds[] = $symptomRecord->id;
            }
            $disease->symptomRecords()->whereNotIn('id', $symptomIds ?: [0])->delete();

            $managementRecords = [];
            $managementIds = [];
            foreach ($management as $item) {
                $managementRecords[$item['category']] = $disease->managementRecords()->updateOrCreate(
                    ['category' => $item['category'], 'sort_order' => $item['sort_order']],
                    $item,
                );
                $managementIds[] = $managementRecords[$item['category']]->id;
            }
            $disease->managementRecords()->whereNotIn('id', $managementIds ?: [0])->delete();

            $evidenceIds = [];
            foreach ($evidence as $claim) {
                $source = $sources[$claim['source']];
                $evidenceRecord = $disease->evidence()->updateOrCreate(
                    ['source_id' => $source->id, 'claim_type' => $claim['claim_type']],
                    [
                        'claim_text' => $claim['claim_text'],
                        'evidence_strength' => $claim['evidence_strength'],
                        'notes' => $claim['notes'] ?? null,
                    ],
                );
                $evidenceIds[] = $evidenceRecord->id;
            }
            $disease->evidence()->whereNotIn('id', $evidenceIds ?: [0])->delete();

            if ($regulatoryCheck) {
                $managementRecord = $managementRecords[$regulatoryCheck['management_category']];
                $source = $sources[$regulatoryCheck['source']];
                $managementRecord->regulatoryChecks()->updateOrCreate(
                    ['source_id' => $source->id, 'product_name' => $regulatoryCheck['product_name']],
                    [
                        'active_ingredient' => $regulatoryCheck['active_ingredient'],
                        'permitted_crop' => $regulatoryCheck['permitted_crop'],
                        'permitted_target' => $regulatoryCheck['permitted_target'],
                        'registration_number' => $regulatoryCheck['registration_number'],
                        'registration_status' => $regulatoryCheck['registration_status'],
                        'registration_expires_at' => $regulatoryCheck['registration_expires_at'],
                        'approved_label_url' => $regulatoryCheck['approved_label_url'],
                        'checked_at' => $this->reviewedAt,
                        'checked_by' => $reviewer?->id,
                        'notes' => $regulatoryCheck['notes'],
                    ],
                );
                $managementRecord->update(['regulatory_checked_at' => $this->reviewedAt]);
                $disease->update(['regulatory_checked_at' => $this->reviewedAt]);
            }

            if ($isVerified) {
                $disease->verifications()->updateOrCreate(
                    ['status' => 'verified', 'expert_id' => $reviewer?->id],
                    [
                        'notes' => 'Source-audited development baseline imported from the documented research dossier. A qualified agricultural reviewer must independently confirm the content before production publication.',
                        'verified_at' => $this->reviewedAt,
                    ],
                );
            } else {
                $disease->verifications()->delete();
            }
        }
    }

    /** @return array<string, ResearchSource> */
    private function seedSources(): array
    {
        $definitions = [
            'nozawa_2026' => [
                'title' => 'Occurrence of Nigrospora spp. as the predominant causal agents of leaf spot disease in Cavendish banana in banana plantations in Mindanao Island, Philippines',
                'authors' => 'Shunsuke Nozawa; Yui Harada; Yoshiki Takata; Keiko Uchida; Mike Andre Malonzo; Reynaldo Valle; Sherman M. Chavez; Aniway F. Penalosa; Kyoko Watanabe',
                'year' => 2026, 'journal_or_institution' => 'Scientific Reports', 'source_type' => 'peer_reviewed_article',
                'volume' => '16', 'issue' => null, 'pages' => '12619', 'doi' => '10.1038/s41598-026-37922-z',
                'reference_url' => 'https://www.nature.com/articles/s41598-026-37922-z', 'country_or_region' => 'Mindanao, Philippines',
                'peer_reviewed' => true, 'philippines_specific' => true, 'publication_date' => '2026-03-08',
                'notes' => 'Molecular, morphological, and pathogenicity evidence that Sigatoka-like leaf spots at six Mindanao sites were predominantly associated with Nigrospora species.',
            ],
            'esguera_2024' => [
                'title' => 'Overview of the Sigatoka leaf spot complex in banana and its current management',
                'authors' => 'Julienne G. Esguera; Mark Angelo Balendres; Diana P. Paguntalan',
                'year' => 2024, 'journal_or_institution' => 'Tropical Plants', 'source_type' => 'review_article',
                'volume' => '3', 'issue' => null, 'pages' => 'e002', 'doi' => '10.48130/tp-0024-0001',
                'reference_url' => 'https://maxapress.com/article/doi/10.48130/tp-0024-0001', 'country_or_region' => 'Philippines / global review',
                'peer_reviewed' => true, 'philippines_specific' => true, 'publication_date' => '2024-01-17',
                'notes' => 'Philippine-authored review covering causal organisms, symptoms, spread, environmental factors, and integrated management of the Sigatoka complex.',
            ],
            'pcaarrd_2017' => [
                'title' => 'Good agricultural practices (GAP) reduces pests and diseases of Lakatan and Cardaba',
                'authors' => 'Rose Anne M. Aya; Gretchen O. Nas; DOST-PCAARRD S&T Media Service',
                'year' => 2017, 'journal_or_institution' => 'DOST-PCAARRD', 'source_type' => 'government_guideline',
                'volume' => null, 'issue' => null, 'pages' => null, 'doi' => null,
                'reference_url' => 'https://www.pcaarrd.dost.gov.ph/index.php/quick-information-dispatch-qid-articles/good-agricultural-practices-gap-reduces-pests-and-diseases-of-lakatan-and-cardaba',
                'country_or_region' => 'Region XII, Philippines', 'peer_reviewed' => false, 'philippines_specific' => true, 'publication_date' => '2017-06-28',
                'notes' => 'Philippine government report on banana disease relevance and reductions observed under GAP interventions.',
            ],
            'mendoza_2019' => [
                'title' => 'Population Structure of the Banana Black Sigatoka Pathogen [Pseudocercospora fijiensis (M. Morelet) Deighton] in Luzon, Philippines',
                'authors' => 'Mary Joy C. Mendoza; Edna Y. Ardales', 'year' => 2019,
                'journal_or_institution' => 'The Philippine Agricultural Scientist', 'source_type' => 'peer_reviewed_article',
                'volume' => '102', 'issue' => '3', 'pages' => '211-219', 'doi' => null,
                'reference_url' => 'https://www.ukdr.uplb.edu.ph/journal-articles/3959/', 'country_or_region' => 'Luzon, Philippines',
                'peer_reviewed' => true, 'philippines_specific' => true, 'publication_date' => null,
                'notes' => 'Direct Philippine molecular evidence for Pseudocercospora fijiensis populations in ten banana-growing provinces in Luzon.',
            ],
            'enardecido_2026' => [
                'title' => 'Histopathology of Cordana musae in the Development of Cordana Leaf Spot Disease in Cardaba and Lakatan Bananas (Musa spp.)',
                'authors' => 'Jolina A. Enardecido', 'year' => 2026, 'journal_or_institution' => 'Philippine Phytopathology',
                'source_type' => 'peer_reviewed_article', 'volume' => '56', 'issue' => '1-2', 'pages' => '12-23', 'doi' => null,
                'reference_url' => 'https://philphytopath.org/manuscript/histopathology-of-cordana-musae-in-the-development-of-cordana-leaf-spot-disease-in-cardaba-and-lakatan-bananas-musa-spp/',
                'country_or_region' => 'Philippines', 'peer_reviewed' => true, 'philippines_specific' => true, 'publication_date' => '2026-03-18',
                'notes' => 'Philippine cultivar-specific histopathology and symptom evidence for Cardaba and Lakatan bananas.',
            ],
            'hernandez_restrepo_2015' => [
                'title' => 'Neocordana gen. nov., the causal organism of Cordana leaf spot on banana',
                'authors' => 'Margarita Hernández-Restrepo; Johannes Z. Groenewald; Pedro W. Crous',
                'year' => 2015, 'journal_or_institution' => 'Phytotaxa', 'source_type' => 'peer_reviewed_article',
                'volume' => '205', 'issue' => '4', 'pages' => '229-238', 'doi' => '10.11646/phytotaxa.205.4.2',
                'reference_url' => 'https://www.biotaxa.org/Phytotaxa/article/view/phytotaxa.205.4.2', 'country_or_region' => 'Global taxonomy',
                'peer_reviewed' => true, 'philippines_specific' => false, 'publication_date' => '2015-04-24',
                'notes' => 'Formal morphological and phylogenetic basis for transferring Cordana musae to Neocordana musae.',
            ],
            'fpa_registered_2026' => [
                'title' => 'Registered pesticide products as of June 30, 2026', 'authors' => 'Philippine Fertilizer and Pesticide Authority',
                'year' => 2026, 'journal_or_institution' => 'Department of Agriculture – Fertilizer and Pesticide Authority',
                'source_type' => 'regulatory_document', 'volume' => null, 'issue' => null, 'pages' => null, 'doi' => null,
                'reference_url' => 'https://fpa.da.gov.ph/resources/reports/registered-products/', 'country_or_region' => 'Philippines',
                'peer_reviewed' => false, 'philippines_specific' => true, 'publication_date' => '2026-06-30',
                'notes' => 'Time-sensitive official registry. Re-check before presenting or acting on any product-specific guidance.',
            ],
            'fpa_banned_restricted' => [
                'title' => 'List of Banned and Restricted Pesticides', 'authors' => 'Philippine Fertilizer and Pesticide Authority',
                'year' => 2026, 'journal_or_institution' => 'Department of Agriculture – Fertilizer and Pesticide Authority',
                'source_type' => 'regulatory_document', 'volume' => null, 'issue' => null, 'pages' => null, 'doi' => null,
                'reference_url' => 'https://fpa.da.gov.ph/resources/reports/list-of-banned-and-restricted-pesticides/', 'country_or_region' => 'Philippines',
                'peer_reviewed' => false, 'philippines_specific' => true, 'publication_date' => null,
                'notes' => 'Official companion safeguard for checking prohibited or restricted pesticide uses, including restrictions relevant to banana.',
            ],
        ];

        $sources = [];
        foreach ($definitions as $key => $definition) {
            $identity = $definition['doi'] ? ['doi' => $definition['doi']] : ['reference_url' => $definition['reference_url']];
            $sources[$key] = ResearchSource::query()->updateOrCreate($identity, [
                ...$definition,
                'accessed_at' => $this->reviewedAt,
                'created_by' => null,
            ]);
        }

        return $sources;
    }

    private function diseases(): array
    {
        return [
            [
                'slug' => 'healthy', 'model_class_key' => 'healthy', 'name' => 'Healthy Banana Leaf', 'alternative_names' => ['No supported disease pattern detected'],
                'scientific_name' => null, 'causal_agent' => null, 'pathogen_type' => null,
                'short_description' => 'No supported disease pattern strongly detected',
                'farmer_summary' => 'The leaf does not strongly match the four diseases currently supported by DahonMD. Other diseases, pests, nutrient problems, physical injury, or environmental stress may not be recognized by the system.',
                'curative_status' => 'unclear_evidence', 'evidence_level' => 'moderate',
                'image_only_limitations' => 'A healthy classification only means none of the supported disease classes was strongly recognized from that photograph. It is not proof that the plant is disease-free.',
                'professional_referral' => 'Ask an agricultural professional if spots, yellowing, wilting, unusual fruit symptoms, or rapid deterioration appear.',
                'description' => 'No supported disease pattern was strongly detected in this banana leaf image.',
                'management' => 'Continue monitoring the plant and maintain good routine crop care.',
                'prevention' => 'Use good agricultural practices and inspect the plant regularly for changes.',
                'symptom_records' => [[
                    'stage' => 'typical', 'plant_part' => 'leaves',
                    'symptom' => 'No image pattern strongly matching the four supported disease classes.',
                    'visible_in_leaf_image' => true, 'farmer_friendly_text' => 'No supported disease pattern was strongly recognized in this image.', 'sort_order' => 1,
                ]],
                'management_records' => [
                    ['category' => 'prevention', 'recommendation' => 'Continue routine monitoring and good agricultural practices.', 'farmer_friendly_text' => 'Continue monitoring the plant and maintain good routine crop care.', 'evidence_strength' => 'moderate', 'requires_professional' => false, 'regulatory_check_required' => false, 'regulatory_checked_at' => null, 'sort_order' => 1],
                    ['category' => 'expert_referral', 'recommendation' => 'Refer new, severe, unusual, or rapidly progressing symptoms for agricultural assessment.', 'farmer_friendly_text' => 'Ask an agricultural professional if concerning symptoms appear or progress.', 'evidence_strength' => 'high', 'requires_professional' => true, 'regulatory_check_required' => false, 'regulatory_checked_at' => null, 'sort_order' => 2],
                ],
                'evidence' => [
                    ['source' => 'nozawa_2026', 'claim_type' => 'differential_diagnosis', 'claim_text' => 'Banana leaf spots outside the supported classes can resemble Sigatoka symptoms, so absence of a supported match cannot establish that a plant is disease-free.', 'evidence_strength' => 'high'],
                    ['source' => 'esguera_2024', 'claim_type' => 'symptom', 'claim_text' => 'Image-visible disease patterns must be interpreted within the limited Sigatoka symptom complex and cannot cover all banana disorders.', 'evidence_strength' => 'moderate'],
                    ['source' => 'pcaarrd_2017', 'claim_type' => 'management', 'claim_text' => 'Good agricultural practices and routine crop management support disease reduction and monitoring in Philippine banana production.', 'evidence_strength' => 'moderate'],
                ],
            ],
            [
                'slug' => 'sigatoka', 'model_class_key' => 'sigatoka', 'name' => 'Sigatoka Leaf Spot', 'alternative_names' => ['Black Sigatoka', 'Yellow Sigatoka', 'Black leaf streak disease', 'Yellow leaf spot'],
                'scientific_name' => 'Pseudocercospora fijiensis / Pseudocercospora musae', 'causal_agent' => 'Pseudocercospora fijiensis or Pseudocercospora musae', 'pathogen_type' => 'fungus',
                'short_description' => 'A merged image-screening class for Black and Yellow Sigatoka leaf-spot patterns',
                'farmer_summary' => 'This class combines source-labeled Black and Yellow Sigatoka images because their visible leaf symptoms can overlap. It screens for the Sigatoka leaf-spot complex and does not identify which pathogen species is present.',
                'curative_status' => 'manageable_not_curable', 'evidence_level' => 'high',
                'image_only_limitations' => 'Black Sigatoka, Yellow Sigatoka, Cordana, and other leaf spots may look similar as symptoms progress. A photograph cannot reliably identify the causal pathogen species.',
                'professional_referral' => 'Ask an agriculturist for assessment when spotting is severe, spreading, or uncertain, especially before choosing disease-specific or chemical control.',
                'description' => 'A merged screening category for Sigatoka-like fungal leaf disease, which can progress from streaks to larger lesions and dead leaf tissue.',
                'management' => 'Use integrated field sanitation, good nutrition, drainage, monitoring, and professional assessment when disease pressure remains high.',
                'prevention' => 'Remove heavily necrotic leaf tissue appropriately, improve drainage and crop nutrition, and reduce conditions that maintain excessive plantation humidity.',
                'symptom_records' => [
                    ['stage' => 'early', 'plant_part' => 'leaves', 'symptom' => 'Pale, light-green, yellowish, rusty-brown, or reddish-brown streaks may develop along the leaf.', 'visible_in_leaf_image' => true, 'farmer_friendly_text' => 'Small pale, yellowish, brown, or dark streaks may first appear on the leaf.', 'sort_order' => 1],
                    ['stage' => 'typical', 'plant_part' => 'leaves', 'symptom' => 'Streaks may enlarge into elongated or elliptical brown-to-dark lesions.', 'visible_in_leaf_image' => true, 'farmer_friendly_text' => 'The streaks may grow into longer brown or dark spots.', 'sort_order' => 2],
                    ['stage' => 'advanced', 'plant_part' => 'leaves', 'symptom' => 'Mature lesions may develop a dark margin, yellow surrounding tissue, and pale or gray necrotic center.', 'visible_in_leaf_image' => true, 'farmer_friendly_text' => 'Older spots can develop a gray center, dark edge, and yellowing around the damaged area.', 'sort_order' => 3],
                    ['stage' => 'advanced', 'plant_part' => 'leaves', 'symptom' => 'Coalescing lesions kill broad areas of leaf tissue.', 'visible_in_leaf_image' => true, 'farmer_friendly_text' => 'When spots join together, larger sections of the leaf may dry out.', 'sort_order' => 4],
                ],
                'management_records' => [
                    ['category' => 'sanitation', 'recommendation' => 'Remove heavily necrotic leaf tissue using appropriate plantation sanitation practices.', 'farmer_friendly_text' => 'Remove heavily diseased or dead leaf tissue following proper farm sanitation practices.', 'evidence_strength' => 'high', 'requires_professional' => false, 'regulatory_check_required' => false, 'regulatory_checked_at' => null, 'sort_order' => 1],
                    ['category' => 'cultural', 'recommendation' => 'Maintain balanced soil fertility, adequate nutrition, good drainage, weed management, and canopy conditions that reduce excessive humidity.', 'farmer_friendly_text' => 'Maintain good drainage and plant nutrition and regularly inspect nearby plants.', 'evidence_strength' => 'high', 'requires_professional' => false, 'regulatory_check_required' => false, 'regulatory_checked_at' => null, 'sort_order' => 2],
                    ['category' => 'prevention', 'recommendation' => 'Use integrated disease monitoring and combine cultural practices rather than relying on a single control measure.', 'farmer_friendly_text' => 'Monitor new leaves and nearby plants and use an integrated management plan if spotting continues to spread.', 'evidence_strength' => 'high', 'requires_professional' => false, 'regulatory_check_required' => false, 'regulatory_checked_at' => null, 'sort_order' => 3],
                    ['category' => 'expert_referral', 'recommendation' => 'Seek expert or pathogen-specific confirmation before disease-specific or chemical control, particularly when lesions are atypical or management response is poor.', 'farmer_friendly_text' => 'Ask an agriculturist for help before disease-specific treatment when symptoms are severe, unusual, or continue spreading.', 'evidence_strength' => 'high', 'requires_professional' => true, 'regulatory_check_required' => false, 'regulatory_checked_at' => null, 'sort_order' => 4],
                ],
                'evidence' => [
                    ['source' => 'mendoza_2019', 'claim_type' => 'causal_agent', 'claim_text' => 'Pseudocercospora fijiensis populations were molecularly investigated from banana-growing provinces in Luzon, Philippines.', 'evidence_strength' => 'high'],
                    ['source' => 'esguera_2024', 'claim_type' => 'causal_agent', 'claim_text' => 'The Sigatoka complex includes Black Sigatoka caused by Pseudocercospora fijiensis and Yellow Sigatoka caused by Pseudocercospora musae.', 'evidence_strength' => 'high'],
                    ['source' => 'esguera_2024', 'claim_type' => 'symptom', 'claim_text' => 'Black and Yellow Sigatoka progress through overlapping streak and lesion stages that can include dark margins, yellow tissue, and gray necrotic centers.', 'evidence_strength' => 'high'],
                    ['source' => 'esguera_2024', 'claim_type' => 'transmission', 'claim_text' => 'Leaf wetness, rain, humidity, conidia, and wind or water dispersal contribute to infection and spread within the Sigatoka complex.', 'evidence_strength' => 'high'],
                    ['source' => 'esguera_2024', 'claim_type' => 'management', 'claim_text' => 'Integrated management includes removal of necrotic tissue, adequate nutrition, drainage, humidity reduction, monitoring, and combined control measures for the Sigatoka complex.', 'evidence_strength' => 'high'],
                    ['source' => 'pcaarrd_2017', 'claim_type' => 'philippine_relevance', 'claim_text' => 'Sigatoka leaf spot is an important disease in Philippine Lakatan and Cardaba production systems, where GAP includes deleafing and crop-management practices.', 'evidence_strength' => 'moderate'],
                    ['source' => 'nozawa_2026', 'claim_type' => 'differential_diagnosis', 'claim_text' => 'Nigrospora species predominated among isolates from Sigatoka-like lesions at sampled Mindanao sites, demonstrating that visual similarity can mislead.', 'evidence_strength' => 'high'],
                    ['source' => 'esguera_2024', 'claim_type' => 'curative_status', 'claim_text' => 'Integrated management reduces disease development and inoculum; necrotic leaf tissue does not return to healthy tissue.', 'evidence_strength' => 'high'],
                    ['source' => 'fpa_banned_restricted', 'claim_type' => 'prevention', 'claim_text' => 'Any pesticide decision must also be checked against the current Philippine banned and restricted pesticide list.', 'evidence_strength' => 'high'],
                ],
            ],
            [
                'slug' => 'panama-disease', 'model_class_key' => 'panama-disease', 'name' => 'Panama Disease', 'alternative_names' => ['Banana Fusarium wilt'],
                'scientific_name' => null, 'causal_agent' => null, 'pathogen_type' => 'fungus',
                'short_description' => 'New model class with source-labeled leaf candidates awaiting expert review and scientific content verification',
                'farmer_summary' => 'Panama disease support is being added. Disease-specific guidance remains unavailable until image review, scientific sourcing, and agricultural review are complete.',
                'curative_status' => 'unclear_evidence', 'verification_status' => 'draft', 'evidence_level' => 'limited',
                'image_only_limitations' => 'The source-labeled leaf candidates have not completed expert review, and no trained or validated Panama disease model is available under the new class contract yet.',
                'professional_referral' => 'Seek agricultural assessment for unexplained yellowing, wilting, or plant decline rather than relying on this pending class.',
                'description' => 'Scientific and image-visible symptom content is pending source review.',
                'management' => 'Disease-specific management guidance is pending source and agricultural review.',
                'prevention' => 'Prevention guidance is pending source and agricultural review.',
                'symptom_records' => [],
                'management_records' => [],
                'evidence' => [],
            ],
            [
                'slug' => 'cordana-leaf-spot', 'model_class_key' => 'cordana-leaf-spot', 'name' => 'Cordana Leaf Spot', 'alternative_names' => ['Cordana leafspot', 'Cordana musae leaf spot'],
                'scientific_name' => 'Neocordana musae', 'causal_agent' => 'Neocordana musae (historically Cordana musae)', 'pathogen_type' => 'fungus',
                'short_description' => 'Fungal leaf spots that vary between banana varieties',
                'farmer_summary' => 'Cordana Leaf Spot is a fungal disease that damages banana leaves by producing expanding spots and injured leaf tissue.',
                'curative_status' => 'unclear_evidence', 'evidence_level' => 'moderate',
                'image_only_limitations' => 'Lesion size, shape, and color can differ between banana cultivars. An image result is screening information and does not confirm the causal fungus.',
                'professional_referral' => 'Have the plant examined by an agriculturist if spotting spreads or becomes severe before applying disease-specific treatment.',
                'description' => 'A fungal leaf-spot disease whose lesion appearance can differ between banana cultivars.',
                'management' => 'Monitor affected and nearby leaves and seek agricultural assessment when spotting spreads or is severe.',
                'prevention' => 'Use good field sanitation and monitoring while cultivar-specific and Philippine management evidence continues to be developed.',
                'symptom_records' => [
                    ['stage' => 'early', 'plant_part' => 'leaves', 'symptom' => 'Cardaba may develop smaller oval-to-elongated lesions.', 'visible_in_leaf_image' => true, 'farmer_friendly_text' => 'Spots may appear small, oval, or elongated.', 'sort_order' => 1],
                    ['stage' => 'typical', 'plant_part' => 'leaves', 'symptom' => 'Lakatan may develop small oval lesions that expand and show varied coloration.', 'visible_in_leaf_image' => true, 'farmer_friendly_text' => 'Spots may expand and show different colors depending on the banana variety.', 'sort_order' => 2],
                    ['stage' => 'advanced', 'plant_part' => 'leaves', 'symptom' => 'Large lesions and extensive tissue damage can reduce photosynthetic leaf area.', 'visible_in_leaf_image' => true, 'farmer_friendly_text' => 'Expanding spots may join into larger damaged areas of the leaf.', 'sort_order' => 3],
                ],
                'management_records' => [
                    ['category' => 'prevention', 'recommendation' => 'Continue monitoring affected and neighboring leaves and maintain general farm sanitation.', 'farmer_friendly_text' => 'Continue monitoring affected leaves and nearby plants and maintain good field sanitation.', 'evidence_strength' => 'limited', 'requires_professional' => false, 'regulatory_check_required' => false, 'regulatory_checked_at' => null, 'sort_order' => 1],
                    ['category' => 'expert_referral', 'recommendation' => 'Obtain agricultural assessment before disease-specific treatment because Philippine management efficacy evidence remains limited.', 'farmer_friendly_text' => 'If spotting is spreading or severe, have the plant examined before applying a disease-specific treatment.', 'evidence_strength' => 'moderate', 'requires_professional' => true, 'regulatory_check_required' => false, 'regulatory_checked_at' => null, 'sort_order' => 2],
                ],
                'evidence' => [
                    ['source' => 'hernandez_restrepo_2015', 'claim_type' => 'taxonomy', 'claim_text' => 'Morphological and phylogenetic work established Neocordana and transferred Cordana musae to Neocordana musae.', 'evidence_strength' => 'high'],
                    ['source' => 'enardecido_2026', 'claim_type' => 'causal_agent', 'claim_text' => 'The Philippine study identifies Cordana musae, now accepted as Neocordana musae, as the pathogen associated with Cordana leaf spot.', 'evidence_strength' => 'high'],
                    ['source' => 'enardecido_2026', 'claim_type' => 'symptom', 'claim_text' => 'Cardaba and Lakatan showed cultivar-dependent lesion shapes, expansion, and coloration with associated leaf-tissue damage.', 'evidence_strength' => 'high'],
                    ['source' => 'enardecido_2026', 'claim_type' => 'management', 'claim_text' => 'Further study is needed on host-pathogen interaction, environmental effects, and integrated disease-management efficacy, supporting conservative referral guidance.', 'evidence_strength' => 'moderate'],
                    ['source' => 'enardecido_2026', 'claim_type' => 'curative_status', 'claim_text' => 'The available Philippine study does not establish a curative treatment; management efficacy remains a research need.', 'evidence_strength' => 'moderate'],
                    ['source' => 'nozawa_2026', 'claim_type' => 'differential_diagnosis', 'claim_text' => 'Multiple fungal pathogens can produce overlapping banana leaf-spot appearances in Philippine fields.', 'evidence_strength' => 'high'],
                    ['source' => 'fpa_banned_restricted', 'claim_type' => 'prevention', 'claim_text' => 'No Cordana-specific chemical recommendation is published in DahonMD; any future pesticide claim must be checked against current Philippine regulatory restrictions.', 'evidence_strength' => 'high'],
                ],
            ],
        ];
    }
}
