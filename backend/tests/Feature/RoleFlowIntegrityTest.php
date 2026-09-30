<?php

namespace Tests\Feature;

use App\Models\DatasetCandidate;
use App\Models\Diagnosis;
use App\Models\DiagnosisReview;
use App\Models\Disease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Cross-role flows (farmer → reviewer → administrator) stay consistent with the
 * database: deletions, consent, review history and dashboard values.
 */
class RoleFlowIntegrityTest extends TestCase
{
    use RefreshDatabase;

    private function diagnosis(User $farmer, array $attributes = []): Diagnosis
    {
        return Diagnosis::query()->create([
            'user_id' => $farmer->id,
            'predicted_class' => 'panama-disease',
            'confidence' => 55,
            'source' => 'web',
            'diagnosed_at' => now(),
            ...$attributes,
        ]);
    }

    private function storedImage(string $path): string
    {
        Storage::disk('local')->put($path, 'image-bytes');

        return $path;
    }

    private function reviewed(Diagnosis $diagnosis, User $expert): void
    {
        $diagnosis->review()->create([
            'expert_id' => $expert->id,
            'review_status' => 'confirmed',
            'verified_label' => $diagnosis->predicted_class,
            'image_quality' => 'good',
            'next_steps' => ['monitor_plant'],
            'reviewed_at' => now(),
        ]);
    }

    public function test_self_service_account_deletion_removes_private_scan_images(): void
    {
        Storage::fake('local');
        Storage::fake('public');
        $farmer = User::factory()->farmer()->create();
        $path = $this->storedImage('diagnoses/self-delete.jpg');
        $this->diagnosis($farmer, ['image_path' => $path]);

        Sanctum::actingAs($farmer);
        $this->deleteJson('/api/profile', ['current_password' => 'password'])->assertNoContent();

        Storage::disk('local')->assertMissing($path);
        $this->assertDatabaseCount('diagnoses', 0);
    }

    public function test_administrator_farmer_deletion_removes_rows_and_images(): void
    {
        Storage::fake('local');
        Storage::fake('public');
        $farmer = User::factory()->farmer()->create();
        $path = $this->storedImage('diagnoses/admin-delete.jpg');
        $this->diagnosis($farmer, ['image_path' => $path]);

        Sanctum::actingAs(User::factory()->admin()->create());
        $this->deleteJson("/api/admin/farmers/{$farmer->id}")->assertNoContent();

        Storage::disk('local')->assertMissing($path);
        $this->assertDatabaseMissing('users', ['id' => $farmer->id]);
        $this->assertDatabaseCount('diagnoses', 0);
    }

    public function test_deleting_a_scan_discards_its_open_nomination_and_orphans_cannot_break_decisions(): void
    {
        Storage::fake('local');
        $farmer = User::factory()->farmer()->create();
        $nominator = User::factory()->agriculturalExpert()->create();
        $decider = User::factory()->agriculturalExpert()->create();
        $diagnosis = $this->diagnosis($farmer, ['image_path' => $this->storedImage('diagnoses/nominated.jpg'), 'research_consented_at' => now()]);
        $this->reviewed($diagnosis, $nominator);
        $candidate = DatasetCandidate::query()->create(['diagnosis_id' => $diagnosis->id, 'proposed_by' => $nominator->id, 'status' => 'pending']);

        Sanctum::actingAs($farmer);
        $this->deleteJson("/api/diagnoses/{$diagnosis->id}")->assertNoContent();
        $this->assertDatabaseMissing('dataset_candidates', ['id' => $candidate->id]);

        // A candidate left behind by an older soft delete must fail cleanly.
        $orphanSource = $this->diagnosis($farmer, ['image_path' => 'diagnoses/orphan.jpg', 'research_consented_at' => now()]);
        $orphan = DatasetCandidate::query()->create(['diagnosis_id' => $orphanSource->id, 'proposed_by' => $nominator->id, 'status' => 'pending']);
        $orphanSource->delete();

        Sanctum::actingAs($decider);
        $this->getJson('/api/expert/dataset-candidates')->assertOk()->assertJsonCount(0, 'data');
        $this->putJson("/api/expert/dataset-candidates/{$orphan->id}", ['status' => 'approved'])
            ->assertUnprocessable()->assertJsonValidationErrors('status');
    }

    public function test_farmer_cannot_delete_an_image_in_an_approved_dataset(): void
    {
        Storage::fake('local');
        $farmer = User::factory()->farmer()->create();
        $expert = User::factory()->agriculturalExpert()->create();
        $path = $this->storedImage('diagnoses/approved.jpg');
        $diagnosis = $this->diagnosis($farmer, [
            'image_path' => $path,
            'research_consented_at' => now(),
            'sync_uuid' => '4b0f7a52-9a39-4c4f-8d2e-2d61f8f0b1aa',
        ]);
        $this->reviewed($diagnosis, $expert);
        DatasetCandidate::query()->create(['diagnosis_id' => $diagnosis->id, 'proposed_by' => $expert->id, 'status' => 'approved']);

        Sanctum::actingAs($farmer);
        $this->deleteJson("/api/diagnoses/{$diagnosis->id}")->assertUnprocessable()->assertJsonValidationErrors('diagnosis');
        $this->postJson('/api/sync', ['deletions' => [['server_id' => $diagnosis->id, 'sync_uuid' => $diagnosis->sync_uuid]]])
            ->assertOk()->assertJsonPath('data.deletion_results.0.status', 'rejected');

        $this->assertNotSoftDeleted('diagnoses', ['id' => $diagnosis->id]);
        Storage::disk('local')->assertExists($path);
    }

    public function test_dashboard_counts_shared_scans_awaiting_photos_and_ignores_deleted_reviews(): void
    {
        $farmer = User::factory()->farmer()->create();
        $expert = User::factory()->agriculturalExpert()->create();
        $this->diagnosis($farmer)->review()->create(['review_status' => 'pending', 'requested_at' => now()]);
        $this->diagnosis($farmer, ['research_consented_at' => now()]);
        $this->diagnosis($farmer, ['research_consented_at' => now(), 'research_consent_withdrawn_at' => now()]);
        $this->diagnosis($farmer, ['research_consented_at' => now(), 'image_path' => 'diagnoses/present.jpg']);
        $deleted = $this->diagnosis($farmer);
        $this->reviewed($deleted, $expert);
        $deleted->delete();

        Sanctum::actingAs(User::factory()->admin()->create());
        $this->getJson('/api/admin/dashboard')->assertOk()
            ->assertJsonPath('data.awaiting_image_uploads', 2)
            ->assertJsonMissingPath('data.pending_or_failed_syncs')
            ->assertJsonPath('data.model_review_analytics.reviewed_diagnoses', 0);

        Sanctum::actingAs($expert);
        $this->getJson('/api/expert/dashboard')->assertOk()->assertJsonPath('data.farmer_review_requests', 1);
    }

    public function test_farmer_grants_and_withdraws_research_consent_after_saving(): void
    {
        Storage::fake('local');
        $farmer = User::factory()->farmer()->create();
        Sanctum::actingAs($farmer);
        $syncUuid = '0d3c8f3e-2f4b-4c55-9f1e-7c9ad0b7e111';
        $this->postJson('/api/sync', ['diagnoses' => [[
            'sync_uuid' => $syncUuid, 'predicted_class' => 'panama-disease', 'confidence' => 88,
            'diagnosed_at' => now()->toIso8601String(), 'source' => 'mobile',
        ]]])->assertOk()->assertJsonPath('data.results.0.status', 'created');
        $diagnosis = Diagnosis::query()->where('sync_uuid', $syncUuid)->firstOrFail();

        $this->post("/api/sync/{$syncUuid}/image", ['image' => UploadedFile::fake()->image('leaf.jpg'), 'purpose' => 'research'], ['Accept' => 'application/json'])
            ->assertUnprocessable();
        $this->postJson("/api/diagnoses/{$diagnosis->id}/research-consent")->assertOk()->assertJsonPath('data.research_consent', true);
        $this->post("/api/sync/{$syncUuid}/image", ['image' => UploadedFile::fake()->image('leaf.jpg'), 'purpose' => 'research'], ['Accept' => 'application/json'])
            ->assertOk();
        $this->assertNotNull($diagnosis->fresh()->image_path);

        $this->deleteJson("/api/diagnoses/{$diagnosis->id}/research-consent")->assertOk()->assertJsonPath('data.research_consent', false);
        $this->postJson("/api/diagnoses/{$diagnosis->id}/research-consent")->assertOk()->assertJsonPath('data.research_consent', true);

        Sanctum::actingAs(User::factory()->farmer()->create());
        $this->postJson("/api/diagnoses/{$diagnosis->id}/research-consent")->assertForbidden();
        $this->deleteJson("/api/diagnoses/{$diagnosis->id}/research-consent")->assertForbidden();
    }

    public function test_sharing_actions_require_a_verified_email_but_offline_sync_does_not(): void
    {
        $farmer = User::factory()->farmer()->unverified()->create();
        Sanctum::actingAs($farmer);
        $syncUuid = '6a0e1c0c-7d7c-4c8f-9d0a-7f1f9a8f2c22';
        $this->postJson('/api/sync', ['diagnoses' => [[
            'sync_uuid' => $syncUuid, 'predicted_class' => 'panama-disease', 'confidence' => 51,
            'diagnosed_at' => now()->toIso8601String(), 'source' => 'mobile',
        ]]])->assertOk()->assertJsonPath('data.results.0.status', 'created');
        $diagnosis = Diagnosis::query()->where('sync_uuid', $syncUuid)->firstOrFail();

        $this->postJson("/api/diagnoses/{$diagnosis->id}/review-request")->assertForbidden();
        $this->postJson("/api/diagnoses/{$diagnosis->id}/research-consent")->assertForbidden();
        $this->post("/api/sync/{$syncUuid}/image", ['image' => UploadedFile::fake()->image('leaf.jpg')], ['Accept' => 'application/json'])->assertForbidden();

        config(['banana.require_verified_email' => false]);
        $this->postJson("/api/diagnoses/{$diagnosis->id}/review-request")->assertOk();

        config(['banana.require_verified_email' => true]);
        Sanctum::actingAs(User::factory()->admin()->unverified()->create());
        $this->getJson('/api/admin/dashboard')->assertForbidden();
    }

    public function test_diagnoses_always_link_to_the_knowledge_record_of_their_class(): void
    {
        $panama = Disease::query()->where('model_class_key', 'panama-disease')->firstOrFail();
        $other = Disease::query()->create([
            'slug' => 'legacy-record', 'name' => 'Legacy', 'description' => 'Legacy', 'symptoms' => [], 'management' => 'Legacy',
        ]);
        $farmer = User::factory()->farmer()->create();
        Sanctum::actingAs($farmer);

        $this->postJson('/api/diagnoses', [
            'disease_id' => $other->id, 'predicted_class' => 'panama-disease', 'confidence' => 90,
            'source' => 'web', 'diagnosed_at' => now()->toIso8601String(),
        ])->assertCreated()->assertJsonPath('data.disease.id', $panama->id);

        $this->postJson('/api/sync', ['diagnoses' => [[
            'sync_uuid' => '2f6b2d7e-9d59-4a53-9a1e-0f8e2c1b3d44', 'predicted_class' => 'panama-disease', 'confidence' => 90,
            'diagnosed_at' => now()->toIso8601String(), 'source' => 'mobile',
        ]]])->assertOk();
        $this->assertSame(2, Diagnosis::query()->where('disease_id', $panama->id)->count());

        Sanctum::actingAs(User::factory()->admin()->create());
        $this->putJson("/api/admin/diseases/{$panama->id}", [
            'slug' => 'panama-renamed', 'model_class_key' => 'panama-disease', 'name' => 'Panama Disease',
            'curative_status' => 'no_known_cure', 'evidence_level' => 'limited',
        ])->assertUnprocessable()->assertJsonValidationErrors('slug');
    }

    public function test_reassessment_keeps_revision_history_and_approved_labels_are_locked(): void
    {
        $farmer = User::factory()->farmer()->create();
        $first = User::factory()->agriculturalExpert()->create();
        $second = User::factory()->agriculturalExpert()->create();
        $diagnosis = $this->diagnosis($farmer, ['image_path' => 'diagnoses/history.jpg', 'research_consented_at' => now()]);
        $assessment = ['image_quality' => 'good', 'next_steps' => ['monitor_plant']];

        Sanctum::actingAs($first);
        $this->putJson("/api/expert/diagnosis-reviews/{$diagnosis->id}", ['review_status' => 'confirmed', ...$assessment])->assertOk();
        $this->putJson("/api/expert/diagnosis-reviews/{$diagnosis->id}", ['review_status' => 'alternate_class', 'verified_label' => 'not-a-class', ...$assessment])
            ->assertUnprocessable()->assertJsonValidationErrors('verified_label');

        Sanctum::actingAs($second);
        $this->putJson("/api/expert/diagnosis-reviews/{$diagnosis->id}", ['review_status' => 'alternate_class', 'verified_label' => 'sigatoka', ...$assessment])
            ->assertOk()
            ->assertJsonPath('data.review.verified_label', 'sigatoka')
            ->assertJsonPath('data.review.revisions.0.review_status', 'confirmed')
            ->assertJsonPath('data.review.revisions.0.reviewer.id', $first->id);
        $this->assertDatabaseCount('diagnosis_review_revisions', 1);

        DatasetCandidate::query()->create(['diagnosis_id' => $diagnosis->id, 'proposed_by' => $first->id, 'status' => 'approved']);
        $this->putJson("/api/expert/diagnosis-reviews/{$diagnosis->id}", ['review_status' => 'confirmed', ...$assessment])
            ->assertUnprocessable()->assertJsonValidationErrors('review_status');
        $this->assertSame('sigatoka', DiagnosisReview::query()->where('diagnosis_id', $diagnosis->id)->value('verified_label'));

        Sanctum::actingAs($farmer);
        $this->getJson("/api/diagnoses/{$diagnosis->id}")->assertOk()->assertJsonMissingPath('data.review.revisions');
    }

    public function test_administrator_decides_on_a_reviewer_nomination(): void
    {
        $farmer = User::factory()->farmer()->create();
        $expert = User::factory()->agriculturalExpert()->create();
        $diagnosis = $this->diagnosis($farmer, ['image_path' => 'diagnoses/admin-decision.jpg', 'research_consented_at' => now()]);
        $this->reviewed($diagnosis, $expert);

        Sanctum::actingAs($expert);
        $candidate = $this->postJson("/api/expert/dataset-candidates/from-diagnosis/{$diagnosis->id}")->assertCreated();

        Sanctum::actingAs(User::factory()->admin()->create());
        $this->getJson('/api/admin/dataset-candidates')->assertOk()->assertJsonCount(1, 'data');
        $this->putJson('/api/admin/dataset-candidates/'.$candidate->json('data.id'), ['status' => 'approved', 'review_notes' => 'Independent approval.'])
            ->assertOk()->assertJsonPath('data.status', 'approved');
    }
}
