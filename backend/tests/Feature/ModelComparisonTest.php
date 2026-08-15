<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ModelComparisonTest extends TestCase
{
    use RefreshDatabase;

    private function image(): UploadedFile
    {
        return UploadedFile::fake()->image('banana-leaf.jpg', 224, 224);
    }

    public function test_research_comparison_is_admin_only_and_explicitly_unconfigured(): void
    {
        Sanctum::actingAs(User::factory()->farmer()->create());
        $this->post('/api/admin/model-comparison', ['image' => $this->image()], ['Accept' => 'application/json'])
            ->assertForbidden();

        Sanctum::actingAs(User::factory()->admin()->create());
        config(['banana.comparison_url' => null]);
        $this->post('/api/admin/model-comparison', ['image' => $this->image()], ['Accept' => 'application/json'])
            ->assertStatus(503)
            ->assertJsonPath('success', false);
    }

    public function test_authenticated_farmer_can_request_the_non_persistent_research_comparison(): void
    {
        config(['banana.comparison_url' => null]);
        Sanctum::actingAs(User::factory()->farmer()->create());

        $this->post('/api/research/model-comparison', ['image' => $this->image()], ['Accept' => 'application/json'])
            ->assertStatus(503)
            ->assertJsonPath('success', false);
        $this->assertDatabaseCount('diagnoses', 0);
    }

    public function test_valid_comparison_is_forwarded_without_creating_farmer_history(): void
    {
        config(['banana.comparison_url' => 'https://research.test/compare']);
        Http::fake(['research.test/*' => Http::response([
            'timestamp' => now()->toIso8601String(),
            'baseline' => [
                'model' => 'baseline', 'predicted_class' => 'sigatoka', 'confidence' => 0.84,
                'inference_time_ms' => 43.2, 'model_size_bytes' => 1800000,
            ],
            'enhanced' => [
                'model' => 'enhanced', 'predicted_class' => 'sigatoka', 'confidence' => 0.91,
                'inference_time_ms' => 48.1, 'model_size_bytes' => 1900000,
            ],
            'comparison' => [
                'prediction_agreement' => true,
                'summary' => 'Both models predicted sigatoka.',
                'enhanced_confidence_difference_percentage_points' => 7.0,
                'enhanced_latency_difference_ms' => 4.9,
                'interpretation_note' => 'Confidence differences for one image do not establish accuracy or model superiority.',
            ],
        ], 200)]);
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->post('/api/admin/model-comparison', ['image' => $this->image()], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.baseline.model', 'baseline')
            ->assertJsonPath('data.enhanced.model', 'enhanced')
            ->assertJsonPath('data.comparison.prediction_agreement', true);
        $this->assertDatabaseCount('diagnoses', 0);
        Http::assertSentCount(1);
    }
}
