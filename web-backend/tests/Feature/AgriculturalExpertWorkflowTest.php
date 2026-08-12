<?php

namespace Tests\Feature;

use App\Models\Diagnosis;
use App\Models\Disease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AgriculturalExpertWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private function diagnosis(User $farmer, float $confidence = 61): Diagnosis
    {
        return Diagnosis::query()->create([
            'user_id' => $farmer->id,
            'predicted_class' => 'fixture-class-0',
            'confidence' => $confidence,
            'model_version' => 'immutable-test-model',
            'inference_time_ms' => 42,
            'source' => 'web',
            'diagnosed_at' => now(),
        ]);
    }

    public function test_farmer_requests_review_and_only_designated_reviewer_can_assess_it(): void
    {
        Disease::query()->create([
            'slug' => 'fixture-class-1', 'model_class_key' => 'fixture-class-1', 'name' => 'Alternative fixture',
            'description' => 'Test-only alternative class.', 'symptoms' => [], 'management' => 'Test-only guidance.',
        ]);
        $farmer = User::factory()->farmer()->create();
        $diagnosis = $this->diagnosis($farmer);

        Sanctum::actingAs($farmer);
        $this->postJson("/api/diagnoses/{$diagnosis->id}/review-request", ['farmer_notes' => 'The spots spread after several rainy days.'])
            ->assertOk()->assertJsonPath('data.review.review_status', 'pending')->assertJsonPath('data.farmer_notes', 'The spots spread after several rainy days.');

        Sanctum::actingAs(User::factory()->admin()->create());
        $this->getJson('/api/expert/dashboard')->assertForbidden();
        $this->putJson("/api/expert/diagnosis-reviews/{$diagnosis->id}", ['review_status' => 'confirmed'])->assertForbidden();

        $expert = User::factory()->agriculturalExpert()->create();
        Sanctum::actingAs($expert);
        $this->getJson('/api/expert/dashboard')->assertOk()
            ->assertJsonPath('data.needs_review', 1)
            ->assertJsonPath('data.farmer_review_requests', 1);
        $this->putJson("/api/expert/diagnosis-reviews/{$diagnosis->id}", [
            'review_status' => 'alternate_class',
            'verified_label' => 'fixture-class-1',
            'image_quality' => 'good',
            'next_steps' => ['monitor_plant', 'seek_field_inspection'],
            'notes' => 'Visible signs better support the alternate configured class.',
        ])->assertOk()
            ->assertJsonPath('data.predicted_class', 'fixture-class-0')
            ->assertJsonPath('data.confidence', 61)
            ->assertJsonPath('data.review.review_status', 'alternate_class')
            ->assertJsonPath('data.review.verified_label', 'fixture-class-1')
            ->assertJsonPath('data.review.image_quality', 'good')
            ->assertJsonPath('data.review.requires_field_inspection', true);

        $this->assertDatabaseHas('diagnoses', ['id' => $diagnosis->id, 'predicted_class' => 'fixture-class-0', 'confidence' => 61]);
        $this->assertDatabaseHas('diagnosis_reviews', ['diagnosis_id' => $diagnosis->id, 'expert_id' => $expert->id, 'review_status' => 'alternate_class']);

        Sanctum::actingAs(User::factory()->admin()->create());
        $this->getJson('/api/admin/analytics')->assertOk()
            ->assertJsonPath('data.model_review_analytics.reviewed_diagnoses', 1)
            ->assertJsonPath('data.model_review_analytics.disagreements', 1)
            ->assertJsonPath('data.model_review_analytics.average_disagreement_confidence', 61)
            ->assertJsonPath('data.model_review_analytics.agreement_rate', 0);

        Sanctum::actingAs($farmer);
        $this->getJson("/api/diagnoses/{$diagnosis->id}")->assertOk()
            ->assertJsonMissingPath('data.review.notes')
            ->assertJsonPath('data.review.farmer_follow_up', 'Review the agricultural assessment and the verified guide for the supported class.');
    }

    public function test_admin_manages_reviewer_accounts_without_granting_admin_access(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);
        $created = $this->postJson('/api/admin/experts', [
            'name' => 'Plant Health Reviewer',
            'email' => 'reviewer@example.test',
            'role' => 'agricultural_expert',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
        ])->assertCreated()->assertJsonPath('data.role', 'agricultural_expert');
        $this->getJson('/api/admin/experts')->assertOk()->assertJsonCount(1, 'data.items');

        Sanctum::actingAs(User::query()->findOrFail($created->json('data.id')));
        $this->getJson('/api/admin/users')->assertForbidden();
        $this->getJson('/api/expert/diagnosis-reviews')->assertOk();
    }

    public function test_reviewed_image_requires_manual_dataset_candidate_decision(): void
    {
        $farmer = User::factory()->farmer()->create();
        $diagnosis = $this->diagnosis($farmer);
        $diagnosis->update(['image_path' => 'diagnoses/test-leaf.jpg']);
        $expert = User::factory()->agriculturalExpert()->create();
        Sanctum::actingAs($expert);

        $this->postJson("/api/expert/dataset-candidates/from-diagnosis/{$diagnosis->id}")
            ->assertUnprocessable();
        $this->putJson("/api/expert/diagnosis-reviews/{$diagnosis->id}", [
            'review_status' => 'possible_outside_supported_classes',
            'image_quality' => 'insufficient_image',
            'next_steps' => ['retake_photo', 'seek_field_inspection'],
            'notes' => 'The visible condition is not represented by the configured classes.',
        ])->assertOk();
        $this->assertDatabaseCount('dataset_candidates', 0);
        $candidate = $this->postJson("/api/expert/dataset-candidates/from-diagnosis/{$diagnosis->id}")
            ->assertCreated()->assertJsonPath('data.status', 'pending');
        $this->assertDatabaseMissing('dataset_candidates', ['diagnosis_id' => $diagnosis->id, 'status' => 'approved']);

        $this->putJson('/api/expert/dataset-candidates/'.$candidate->json('data.id'), [
            'status' => 'uncertain', 'review_notes' => 'Retain outside training data pending better evidence.',
        ])->assertOk()->assertJsonPath('data.status', 'uncertain');
    }
}
