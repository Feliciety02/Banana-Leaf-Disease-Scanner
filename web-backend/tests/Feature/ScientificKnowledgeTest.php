<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ScientificKnowledgeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['banana.label_map_path' => base_path('tests/fixtures/label_map.json')]);
        Sanctum::actingAs(User::factory()->admin()->create());
    }

    public function test_verified_only_publication_and_edit_re_review_lifecycle(): void
    {
        $disease = $this->postJson('/api/admin/diseases', [
            'slug' => 'fixture-class-0', 'model_class_key' => 'fixture-class-0', 'name' => 'Test fixture disease',
            'causal_agent' => 'Test fixture organism', 'pathogen_type' => 'other',
            'farmer_summary' => 'Test-only farmer content.', 'curative_status' => 'unclear_evidence', 'evidence_level' => 'high',
            'image_only_limitations' => 'Test-only limitation.', 'professional_referral' => 'Test-only referral.',
        ])->assertCreated()->json('data');

        $this->getJson('/api/diseases')->assertOk()->assertJsonCount(0, 'data');

        $peerOne = $this->source('Peer fixture one', 'peer_reviewed_article', true);
        $peerTwo = $this->source('Peer fixture two', 'review_article', true);
        $authority = $this->source('Authority fixture', 'government_guideline', false);

        $this->postJson("/api/admin/diseases/{$disease['id']}/symptoms", [
            'stage' => 'typical', 'plant_part' => 'leaves', 'symptom' => 'Test-only technical symptom.',
            'visible_in_leaf_image' => true, 'farmer_friendly_text' => 'Test-only visible sign.', 'sort_order' => 1,
        ])->assertCreated();
        $this->postJson("/api/admin/diseases/{$disease['id']}/management", [
            'category' => 'expert_referral', 'recommendation' => 'Test-only technical referral.',
            'farmer_friendly_text' => 'Test-only farmer referral.', 'evidence_strength' => 'high',
            'requires_professional' => true, 'regulatory_check_required' => false, 'sort_order' => 1,
        ])->assertCreated();

        foreach ([
            [$peerOne, 'causal_agent', 'Test-only causal-agent claim.'],
            [$peerTwo, 'symptom', 'Test-only symptom claim.'],
            [$authority, 'management', 'Test-only management claim.'],
            [$peerOne, 'curative_status', 'Test-only curative-status claim.'],
        ] as [$source, $type, $claim]) {
            $this->postJson("/api/admin/diseases/{$disease['id']}/evidence", [
                'source_id' => $source, 'claim_type' => $type, 'claim_text' => $claim, 'evidence_strength' => 'high',
            ])->assertCreated();
        }

        $this->putJson("/api/admin/diseases/{$disease['id']}/status", ['status' => 'verified'])
            ->assertUnprocessable();
        Sanctum::actingAs(User::factory()->agriculturalExpert()->create());
        $this->postJson("/api/expert/diseases/{$disease['id']}/verification", ['status' => 'verified', 'notes' => 'Evidence and farmer guidance reviewed.'])
            ->assertCreated()->assertJsonPath('data.disease.is_verified', true);
        $this->getJson('/api/diseases')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Test fixture disease');

        Sanctum::actingAs(User::factory()->admin()->create());
        $this->putJson("/api/admin/diseases/{$disease['id']}", [
            'slug' => 'fixture-class-0', 'model_class_key' => 'fixture-class-0', 'name' => 'Edited test fixture disease',
            'causal_agent' => 'Test fixture organism', 'pathogen_type' => 'other',
            'farmer_summary' => 'Edited test-only content.', 'curative_status' => 'unclear_evidence', 'evidence_level' => 'high',
        ])->assertOk()->assertJsonPath('data.verification_status', 'researched')->assertJsonPath('data.is_verified', false);
        $this->getJson('/api/diseases')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_chemical_guidance_requires_regulatory_flag_and_farmer_cannot_manage_sources(): void
    {
        $disease = $this->postJson('/api/admin/diseases', [
            'slug' => 'fixture-class-2', 'model_class_key' => 'fixture-class-2', 'name' => 'Chemical-rule fixture',
            'curative_status' => 'unclear_evidence', 'evidence_level' => 'limited',
        ])->assertCreated()->json('data');

        $this->postJson("/api/admin/diseases/{$disease['id']}/management", [
            'category' => 'chemical', 'recommendation' => 'Test-only chemical claim.', 'farmer_friendly_text' => 'Test-only.',
            'evidence_strength' => 'limited', 'requires_professional' => true, 'regulatory_check_required' => false,
        ])->assertUnprocessable()->assertJsonValidationErrors('regulatory_check_required');

        Sanctum::actingAs(User::factory()->farmer()->create());
        $this->getJson('/api/admin/research-sources')->assertForbidden();
        $this->postJson('/api/admin/research-sources', [])->assertForbidden();
    }

    private function source(string $title, string $type, bool $peerReviewed): int
    {
        return $this->postJson('/api/admin/research-sources', [
            'title' => $title, 'authors' => 'Test Fixture Author', 'year' => 2026,
            'journal_or_institution' => 'Test Fixture Institution', 'source_type' => $type,
            'peer_reviewed' => $peerReviewed, 'philippines_specific' => false,
        ])->assertCreated()->json('data.id');
    }
}
