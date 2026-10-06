<?php

namespace Tests\Feature;

use App\Models\Diagnosis;
use App\Models\Disease;
use App\Models\User;
use App\Support\ClassLabelRegistry;
use App\Services\InferenceReceiptService;
use Database\Seeders\ScientificKnowledgeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DiagnosisRecordCompletenessTest extends TestCase
{
    use RefreshDatabase;

    private function mobileScan(array $overrides = []): array
    {
        return [
            'sync_uuid' => '6f0b8a52-2a55-4a9e-9d0a-0d1f2f7c8b11',
            'predicted_class' => 'sigatoka',
            'confidence' => 88.4,
            'model_version' => 'ca_mobilenetv3_small_fp32',
            'inference_time_ms' => 7,
            'source' => 'mobile',
            'diagnosed_at' => now()->toIso8601String(),
            'class_probabilities' => ['healthy' => 0.05, 'sigatoka' => 0.884, 'panama-disease' => 0.02, 'cordana-leaf-spot' => 0.046],
            'model_comparison' => [
                'baseline' => ['predicted_class' => 'sigatoka', 'confidence' => 0.71, 'inference_time_ms' => 3.2, 'model' => 'ca_mobilenetv3_small_int8', 'probabilities' => ['sigatoka' => 0.71, 'healthy' => 0.29]],
                'enhanced' => ['predicted_class' => 'sigatoka', 'confidence' => 0.884, 'inference_time_ms' => 7.0, 'model' => 'ca_mobilenetv3_small_fp32'],
            ],
            ...$overrides,
        ];
    }

    public function test_mobile_scans_keep_the_model_mode_but_remain_client_reported_without_a_receipt(): void
    {
        config(['banana.ai_mode' => 'SIMULATED / DEVELOPMENT']);
        Sanctum::actingAs(User::factory()->farmer()->create());

        $this->postJson('/api/sync', ['diagnoses' => [$this->mobileScan()]])
            ->assertOk()->assertJsonPath('data.results.0.status', 'created');

        $this->assertFalse(Diagnosis::query()->sole()->is_simulated);
        $this->assertFalse(Diagnosis::query()->sole()->prediction_verified);
    }

    public function test_server_receipt_attests_the_exact_uploaded_image_and_prediction(): void
    {
        Storage::fake('local');
        Sanctum::actingAs(User::factory()->farmer()->create());
        $scan = $this->mobileScan();
        $this->postJson('/api/sync', ['diagnoses' => [$scan]])
            ->assertOk()->assertJsonPath('data.results.0.status', 'created');
        $photo = UploadedFile::fake()->image('banana.jpg');
        $receipt = app(InferenceReceiptService::class)->issue($photo, [
            'diseaseId' => $scan['predicted_class'], 'confidence' => $scan['confidence'],
            'model' => $scan['model_version'], 'is_simulated' => false,
        ]);

        $this->post('/api/sync/'.$scan['sync_uuid'].'/image', [
            'image' => $photo, 'inference_receipt' => $receipt,
        ], ['Accept' => 'application/json'])->assertOk();
        $this->assertTrue(Diagnosis::query()->sole()->prediction_verified);
    }

    public function test_web_records_still_follow_the_server_ai_mode(): void
    {
        config(['banana.ai_mode' => 'SIMULATED / DEVELOPMENT']);
        $this->assertTrue(Diagnosis::isSimulatedFor('web'));
        config(['banana.ai_mode' => 'PRODUCTION']);
        $this->assertFalse(Diagnosis::isSimulatedFor('web'));
        $this->assertFalse(Diagnosis::isSimulatedFor('mobile'));
    }

    public function test_class_probabilities_and_model_comparison_are_stored_and_returned(): void
    {
        Sanctum::actingAs(User::factory()->farmer()->create());

        $this->postJson('/api/sync', ['diagnoses' => [$this->mobileScan()]])->assertOk();

        $diagnosis = Diagnosis::query()->sole();
        $this->assertEqualsWithDelta(0.884, $diagnosis->class_probabilities['sigatoka'], 1e-9);
        $this->assertSame('ca_mobilenetv3_small_int8', $diagnosis->model_comparison['baseline']['model']);

        $this->getJson('/api/diagnoses/'.$diagnosis->id)->assertOk()
            ->assertJsonPath('data.model_comparison.enhanced.predicted_class', 'sigatoka');
    }

    public function test_probabilities_for_unknown_classes_are_rejected(): void
    {
        Sanctum::actingAs(User::factory()->farmer()->create());

        $this->postJson('/api/sync', ['diagnoses' => [$this->mobileScan([
            'class_probabilities' => ['healthy' => 0.5, 'black-sigatoka' => 0.5],
        ])]])->assertOk()->assertJsonPath('data.results.0.status', 'rejected');

        $this->postJson('/api/sync', ['diagnoses' => [$this->mobileScan([
            'class_probabilities' => ['healthy' => 1.5],
        ])]])->assertOk()->assertJsonPath('data.results.0.status', 'rejected');

        $this->assertDatabaseCount('diagnoses', 0);
    }

    public function test_prediction_details_are_immutable_once_stored(): void
    {
        Sanctum::actingAs(User::factory()->farmer()->create());
        $this->postJson('/api/sync', ['diagnoses' => [$this->mobileScan()]])->assertOk();

        $this->expectException(\LogicException::class);
        Diagnosis::query()->sole()->update(['class_probabilities' => ['healthy' => 1.0]]);
    }

    public function test_default_label_map_matches_the_deployed_four_class_model(): void
    {
        config(['banana.label_map_path' => resource_path('models/label_map.json')]);

        $this->assertSame(config('banana.class_labels'), app(ClassLabelRegistry::class)->labels());
    }

    public function test_every_model_class_has_sourced_disease_content(): void
    {
        $this->seed(ScientificKnowledgeSeeder::class);

        foreach (config('banana.class_labels') as $class) {
            $disease = Disease::query()->where('model_class_key', $class)->firstOrFail();
            $this->assertNotEmpty($disease->description, $class);
            $this->assertGreaterThan(0, $disease->evidence()->count(), "{$class} has no evidence");
            $this->assertGreaterThan(0, $disease->managementRecords()->count(), "{$class} has no management guidance");
        }

        $panama = Disease::query()->where('model_class_key', 'panama-disease')->firstOrFail();
        $this->assertSame('Fusarium oxysporum f. sp. cubense', $panama->scientific_name);
        $this->assertSame('no_known_cure', $panama->curative_status);

        // Seeded values must stay editable through the admin forms' allowed lists.
        foreach (Disease::query()->with('symptomRecords')->get()->flatMap->symptomRecords as $symptom) {
            $this->assertContains($symptom->stage, ['early', 'typical', 'advanced']);
            $this->assertContains($symptom->plant_part, ['leaves', 'pseudostem', 'roots', 'fruit', 'flower', 'suckers']);
        }
    }

    public function test_production_seeding_adds_content_for_review_without_verifying_or_overwriting_it(): void
    {
        $this->app['env'] = 'production';
        $existing = Disease::query()->create([
            'slug' => 'healthy', 'model_class_key' => 'healthy', 'name' => 'Expert-edited Healthy Leaf',
            'description' => 'Edited by an agriculturist.', 'symptoms' => [], 'management' => 'Edited.',
            'verification_status' => 'verified', 'is_verified' => true,
        ]);

        $this->artisan('db:seed', ['--class' => ScientificKnowledgeSeeder::class, '--force' => true])->assertSuccessful();

        $this->assertSame('Expert-edited Healthy Leaf', $existing->fresh()->name);
        foreach (['sigatoka', 'panama-disease', 'cordana-leaf-spot'] as $class) {
            $disease = Disease::query()->where('model_class_key', $class)->firstOrFail();
            $this->assertSame('researched', $disease->verification_status, $class);
            $this->assertFalse($disease->is_verified, $class);
            $this->assertNull($disease->verified_by, $class);
        }
    }
}
