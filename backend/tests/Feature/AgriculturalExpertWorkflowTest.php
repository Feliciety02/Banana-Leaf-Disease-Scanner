<?php

namespace Tests\Feature;

use App\Models\Diagnosis;
use App\Models\Disease;
use App\Models\User;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AgriculturalExpertWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private function diagnosis(User $farmer, float $confidence = 61): Diagnosis
    {
        return Diagnosis::query()->create([
            'user_id' => $farmer->id,
            'predicted_class' => 'sigatoka',
            'confidence' => $confidence,
            'model_version' => 'immutable-test-model',
            'inference_time_ms' => 42,
            'source' => 'web',
            'diagnosed_at' => now(),
        ]);
    }

    public function test_farmer_requests_review_and_only_designated_reviewer_can_assess_it(): void
    {
        Disease::query()->where('model_class_key', 'panama-disease')->update([
            'name' => 'Alternative fixture',
            'description' => 'Test-only alternative class.',
            'symptoms' => [],
            'management' => 'Test-only guidance.',
        ]);
        $farmer = User::factory()->farmer()->create();
        $diagnosis = $this->diagnosis($farmer);
        $diagnosis->update(['image_path' => 'diagnoses/review-leaf.jpg']);

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
            'verified_label' => 'panama-disease',
            'image_quality' => 'good',
            'next_steps' => ['monitor_plant', 'seek_field_inspection'],
            'notes' => 'Visible signs better support the alternate configured class.',
            'farmer_message' => 'Remove the yellowing lower leaves and check the base of the stem this week.',
        ])->assertOk()
            ->assertJsonPath('data.predicted_class', 'sigatoka')
            ->assertJsonPath('data.confidence', 61)
            ->assertJsonPath('data.review.review_status', 'alternate_class')
            ->assertJsonPath('data.review.verified_label', 'panama-disease')
            ->assertJsonPath('data.review.image_quality', 'good')
            ->assertJsonPath('data.review.requires_field_inspection', true);

        $this->assertDatabaseHas('diagnoses', ['id' => $diagnosis->id, 'predicted_class' => 'sigatoka', 'confidence' => 61]);
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
            ->assertJsonPath('data.review.farmer_message', 'Remove the yellowing lower leaves and check the base of the stem this week.')
            ->assertJsonPath('data.review.farmer_follow_up', 'Review the agricultural assessment and the verified guide for the supported class.');
    }

    public function test_completed_review_stays_new_for_the_farmer_until_opened(): void
    {
        $farmer = User::factory()->farmer()->create();
        $diagnosis = $this->diagnosis($farmer);
        $diagnosis->update(['image_path' => 'diagnoses/seen-leaf.jpg']);
        $assessment = ['review_status' => 'confirmed', 'image_quality' => 'good', 'next_steps' => ['monitor_plant']];

        Sanctum::actingAs($farmer);
        $this->postJson("/api/diagnoses/{$diagnosis->id}/review-request")->assertOk();
        // A pending request has nothing to read yet.
        $this->postJson("/api/diagnoses/{$diagnosis->id}/review-seen")->assertOk()->assertJsonPath('data.review.farmer_seen_at', null);

        $expert = User::factory()->agriculturalExpert()->create();
        Sanctum::actingAs($expert);
        $this->putJson("/api/expert/diagnosis-reviews/{$diagnosis->id}", $assessment)->assertOk();

        Sanctum::actingAs(User::factory()->farmer()->create());
        $this->postJson("/api/diagnoses/{$diagnosis->id}/review-seen")->assertForbidden();

        Sanctum::actingAs($farmer);
        $this->getJson("/api/diagnoses/{$diagnosis->id}")->assertOk()->assertJsonPath('data.review.farmer_seen_at', null);
        $seenAt = $this->postJson("/api/diagnoses/{$diagnosis->id}/review-seen")->assertOk()->json('data.review.farmer_seen_at');
        $this->assertNotNull($seenAt);

        // Revising the assessment makes it new again.
        Sanctum::actingAs($expert);
        $this->putJson("/api/expert/diagnosis-reviews/{$diagnosis->id}", [...$assessment, 'review_status' => 'cannot_determine'])->assertOk();
        Sanctum::actingAs($farmer);
        $this->getJson("/api/diagnoses/{$diagnosis->id}")->assertOk()->assertJsonPath('data.review.farmer_seen_at', null);
    }

    public function test_farmer_reply_with_new_photo_reopens_the_case_and_keeps_history(): void
    {
        Storage::fake('local');
        $farmer = User::factory()->farmer()->create();
        $diagnosis = $this->diagnosis($farmer);
        $diagnosis->update(['image_path' => 'diagnoses/blurry.jpg', 'farmer_notes' => 'Spots on older leaves.']);
        Storage::disk('local')->put('diagnoses/blurry.jpg', 'old');
        $expert = User::factory()->agriculturalExpert()->create();

        Sanctum::actingAs($farmer);
        $this->postJson("/api/diagnoses/{$diagnosis->id}/follow-up", ['farmer_reply' => 'Too early'])->assertUnprocessable();
        $this->postJson("/api/diagnoses/{$diagnosis->id}/review-request")->assertOk();
        Sanctum::actingAs($expert);
        $this->putJson("/api/expert/diagnosis-reviews/{$diagnosis->id}", [
            'review_status' => 'cannot_determine', 'image_quality' => 'blurry', 'next_steps' => ['retake_photo'],
            'farmer_message' => 'Please retake the photo in daylight.',
        ])->assertOk();

        Sanctum::actingAs(User::factory()->farmer()->create());
        $this->post("/api/diagnoses/{$diagnosis->id}/follow-up", ['farmer_reply' => 'Not mine'], ['Accept' => 'application/json'])->assertForbidden();

        Sanctum::actingAs($farmer);
        $this->post("/api/diagnoses/{$diagnosis->id}/follow-up", [
            'farmer_reply' => 'Here is a clearer photo taken this morning.',
            'image' => UploadedFile::fake()->image('clear.jpg'),
        ], ['Accept' => 'application/json'])->assertOk()
            ->assertJsonPath('data.review.review_status', 'pending')
            ->assertJsonPath('data.review.farmer_reply', 'Here is a clearer photo taken this morning.')
            ->assertJsonPath('data.review.farmer_message', null)
            ->assertJsonPath('data.farmer_notes', 'Spots on older leaves.');

        $fresh = $diagnosis->fresh();
        $this->assertNotSame('diagnoses/blurry.jpg', $fresh->image_path);
        Storage::disk('local')->assertExists($fresh->image_path);
        Storage::disk('local')->assertMissing('diagnoses/blurry.jpg');

        // The reviewer sees the reopened case with the earlier round in its history.
        Sanctum::actingAs($expert);
        $this->getJson("/api/expert/diagnosis-reviews/{$diagnosis->id}")->assertOk()
            ->assertJsonPath('data.review.review_status', 'pending')
            ->assertJsonPath('data.review.revisions.0.review_status', 'cannot_determine')
            ->assertJsonPath('data.review.revisions.0.farmer_message', 'Please retake the photo in daylight.');
    }

    public function test_a_claimed_case_cannot_be_assessed_by_another_reviewer_until_released_or_expired(): void
    {
        $farmer = User::factory()->farmer()->create();
        $diagnosis = $this->diagnosis($farmer);
        $diagnosis->update(['image_path' => 'diagnoses/claimed-leaf.jpg']);
        $first = User::factory()->agriculturalExpert()->create(['name' => 'Reviewer One']);
        $second = User::factory()->agriculturalExpert()->create();
        $assessment = ['review_status' => 'confirmed', 'image_quality' => 'good', 'next_steps' => ['monitor_plant']];

        Sanctum::actingAs($farmer);
        $this->postJson("/api/expert/diagnosis-reviews/{$diagnosis->id}/claim")->assertForbidden();

        Sanctum::actingAs($first);
        $this->postJson("/api/expert/diagnosis-reviews/{$diagnosis->id}/claim")->assertOk()->assertJsonPath('data.user.name', 'Reviewer One');

        // The farmer learns that a reviewer is on it, but not who.
        Sanctum::actingAs($farmer);
        $farmerView = $this->getJson("/api/diagnoses/{$diagnosis->id}")->assertOk()->assertJsonMissingPath('data.review_claim');
        $this->assertNotNull($farmerView->json('data.review_in_progress_until'));
        $this->assertTrue(collect($this->getJson('/api/sync')->json('data.changes'))->contains(fn ($change) => ($change['diagnosis']['id'] ?? null) === $diagnosis->id && $change['diagnosis']['review_in_progress_until'] !== null));

        Sanctum::actingAs($second);
        $this->getJson("/api/expert/diagnosis-reviews/{$diagnosis->id}")->assertOk()->assertJsonPath('data.review_claim.user.name', 'Reviewer One');
        $this->postJson("/api/expert/diagnosis-reviews/{$diagnosis->id}/claim")->assertUnprocessable();
        $this->putJson("/api/expert/diagnosis-reviews/{$diagnosis->id}", $assessment)->assertUnprocessable()
            ->assertJsonPath('errors.review_status.0', fn ($message) => str_contains($message, 'Reviewer One is reviewing this case'));

        // Releasing frees the case; an expired claim no longer blocks anyone.
        Sanctum::actingAs($first);
        $this->deleteJson("/api/expert/diagnosis-reviews/{$diagnosis->id}/claim")->assertOk();
        $this->postJson("/api/expert/diagnosis-reviews/{$diagnosis->id}/claim")->assertOk();
        \App\Models\ReviewClaim::query()->update(['expires_at' => now()->subMinute()]);

        Sanctum::actingAs($second);
        $this->getJson("/api/expert/diagnosis-reviews/{$diagnosis->id}")->assertOk()->assertJsonMissingPath('data.review_claim');
        $this->putJson("/api/expert/diagnosis-reviews/{$diagnosis->id}", $assessment)->assertOk();
        $this->assertDatabaseCount('review_claims', 0);
    }

    public function test_reviewer_sees_the_farmers_other_recent_scans_with_their_outcomes(): void
    {
        $farmer = User::factory()->farmer()->create();
        $earlier = $this->diagnosis($farmer, 88);
        $earlier->review()->create(['review_status' => 'confirmed', 'verified_label' => 'sigatoka', 'reviewed_at' => now()->subDays(2)]);
        $current = $this->diagnosis($farmer);
        $this->diagnosis(User::factory()->farmer()->create());

        Sanctum::actingAs(User::factory()->agriculturalExpert()->create());
        $response = $this->getJson("/api/expert/diagnosis-reviews/{$current->id}")->assertOk()
            ->assertJsonPath('data.id', $current->id)
            ->assertJsonCount(1, 'data.farmer_history')
            ->assertJsonPath('data.farmer_history.0.id', $earlier->id)
            ->assertJsonPath('data.farmer_history.0.review_status', 'confirmed')
            ->assertJsonPath('data.farmer_history.0.verified_label', 'sigatoka');
        $this->assertArrayNotHasKey('image_path', $response->json('data.farmer_history.0'));
    }

    public function test_admin_sees_how_long_farmers_wait_for_reviews(): void
    {
        $farmer = User::factory()->farmer()->create();
        $answered = $this->diagnosis($farmer);
        $answered->review()->create(['review_status' => 'confirmed', 'requested_at' => now()->subHours(10), 'reviewed_at' => now()->subHours(4)]);
        $quick = $this->diagnosis($farmer);
        $quick->review()->create(['review_status' => 'cannot_determine', 'requested_at' => now()->subHours(3), 'reviewed_at' => now()->subHours(1)]);
        $this->diagnosis($farmer)->review()->create(['review_status' => 'pending', 'requested_at' => now()->subDays(5)]);
        $this->diagnosis($farmer)->review()->create(['review_status' => 'pending', 'requested_at' => now()->subHours(2)]);

        Sanctum::actingAs(User::factory()->admin()->create());
        $this->getJson('/api/admin/analytics')->assertOk()
            ->assertJsonPath('data.review_turnaround.waiting_requests', 2)
            ->assertJsonPath('data.review_turnaround.waiting_over_overdue', 1)
            ->assertJsonPath('data.review_turnaround.completed_last_30_days', 2)
            ->assertJsonPath('data.review_turnaround.median_hours_last_30_days', 4)
            ->assertJsonPath('data.review_turnaround.average_hours_last_30_days', 4)
            ->assertJsonPath('data.review_turnaround.oldest_waiting_hours', 120);
    }

    public function test_admin_manages_reviewer_accounts_without_granting_admin_access(): void
    {
        Notification::fake();
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);
        $created = $this->postJson('/api/admin/experts', [
            'name' => 'Plant Health Reviewer',
            'email' => 'reviewer@example.test',
            'role' => 'agricultural_expert',
            'password' => 'Secret123!',
            'password_confirmation' => 'Secret123!',
        ])->assertCreated()->assertJsonPath('data.role', 'agricultural_expert');
        $this->getJson('/api/admin/experts')->assertOk()->assertJsonCount(1, 'data.items');

        $reviewer = User::query()->findOrFail($created->json('data.id'));
        Notification::assertSentTo($reviewer, VerifyEmail::class);

        Sanctum::actingAs($reviewer);
        $this->getJson('/api/admin/users')->assertForbidden();
        $this->getJson('/api/expert/diagnosis-reviews')->assertForbidden()
            ->assertJsonPath('errors.email.0', 'Your email address is not verified.');

        $reviewer->markEmailAsVerified();
        $this->getJson('/api/expert/diagnosis-reviews')->assertOk();
    }

    public function test_reviewer_cannot_assign_a_disease_without_a_scan_photo(): void
    {
        $farmer = User::factory()->farmer()->create();
        $diagnosis = $this->diagnosis($farmer);
        Sanctum::actingAs(User::factory()->agriculturalExpert()->create());

        $this->putJson("/api/expert/diagnosis-reviews/{$diagnosis->id}", [
            'review_status' => 'confirmed',
            'image_quality' => 'good',
            'next_steps' => ['monitor_plant'],
        ])->assertUnprocessable()->assertJsonValidationErrors('review_status');

        $this->putJson("/api/expert/diagnosis-reviews/{$diagnosis->id}", [
            'review_status' => 'cannot_determine',
            'image_quality' => 'insufficient_image',
            'next_steps' => ['retake_photo'],
        ])->assertOk()->assertJsonPath('data.review.review_status', 'cannot_determine');
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
        $this->postJson("/api/expert/dataset-candidates/from-diagnosis/{$diagnosis->id}")
            ->assertUnprocessable()
            ->assertJsonValidationErrors('diagnosis');
        $diagnosis->update([
            'research_consented_at' => now(),
            'research_consent_version' => 'research-image-consent-v1',
        ]);
        $candidate = $this->postJson("/api/expert/dataset-candidates/from-diagnosis/{$diagnosis->id}")
            ->assertCreated()->assertJsonPath('data.status', 'pending');
        $this->assertDatabaseMissing('dataset_candidates', ['diagnosis_id' => $diagnosis->id, 'status' => 'approved']);

        $this->putJson('/api/expert/dataset-candidates/'.$candidate->json('data.id'), [
            'status' => 'uncertain', 'review_notes' => 'Deciding on my own nomination.',
        ])->assertUnprocessable()->assertJsonValidationErrors('status');

        $secondReviewer = User::factory()->agriculturalExpert()->create();
        Sanctum::actingAs($secondReviewer);
        $this->putJson('/api/expert/dataset-candidates/'.$candidate->json('data.id'), [
            'status' => 'uncertain', 'review_notes' => 'Retain outside training data pending better evidence.',
        ])->assertOk()->assertJsonPath('data.status', 'uncertain');

        Sanctum::actingAs($farmer);
        $this->deleteJson("/api/diagnoses/{$diagnosis->id}/research-consent")
            ->assertOk()
            ->assertJsonPath('data.research_consent', false);

        Sanctum::actingAs($secondReviewer);
        $this->putJson('/api/expert/dataset-candidates/'.$candidate->json('data.id'), [
            'status' => 'approved', 'review_notes' => 'Attempted after withdrawal.',
        ])->assertUnprocessable()->assertJsonValidationErrors('status');
    }
}
