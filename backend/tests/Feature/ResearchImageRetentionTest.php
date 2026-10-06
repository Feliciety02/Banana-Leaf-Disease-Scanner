<?php

namespace Tests\Feature;

use App\Models\DatasetCandidate;
use App\Models\Diagnosis;
use App\Models\ResearchImage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ResearchImageRetentionTest extends TestCase
{
    use RefreshDatabase;

    private function approvedCopy(): array
    {
        Storage::fake('local');
        $farmer = User::factory()->farmer()->create([
            'password' => Hash::make('Correct123!'),
            'research_photo_consent_at' => now()->subMinute(), 'research_photo_consent_version' => config('banana.research_consent_version'),
        ]);
        $expert = User::factory()->agriculturalExpert()->create();
        $admin = User::factory()->admin()->create();
        Storage::disk('local')->put('diagnoses/research-source.jpg', 'research-photo-bytes');
        $diagnosis = Diagnosis::query()->create([
            'user_id' => $farmer->id, 'predicted_class' => 'sigatoka', 'confidence' => 82,
            'source' => 'web', 'diagnosed_at' => now(), 'image_path' => 'diagnoses/research-source.jpg',
            'research_consented_at' => now(), 'research_consent_version' => config('banana.research_consent_version'),
        ]);
        $diagnosis->review()->create([
            'expert_id' => $expert->id, 'review_status' => 'confirmed',
            'verified_label' => 'sigatoka', 'image_quality' => 'good', 'reviewed_at' => now(),
        ]);
        $candidate = DatasetCandidate::query()->create([
            'diagnosis_id' => $diagnosis->id, 'proposed_by' => $expert->id, 'status' => 'pending',
        ]);
        Sanctum::actingAs($admin);
        $this->putJson("/api/admin/dataset-candidates/{$candidate->id}", ['status' => 'approved'])
            ->assertOk();

        return [$farmer, $admin, $diagnosis, $candidate, ResearchImage::query()->firstOrFail()];
    }

    public function test_account_deletion_keeps_separate_copy_and_unlinks_the_farmer_by_default(): void
    {
        [$farmer, , $diagnosis, , $copy] = $this->approvedCopy();
        $path = $copy->image_path;
        Sanctum::actingAs($farmer);
        $this->deleteJson('/api/profile', ['current_password' => 'Correct123!'])->assertNoContent();

        $this->assertDatabaseMissing('users', ['id' => $farmer->id]);
        $this->assertDatabaseMissing('diagnoses', ['id' => $diagnosis->id]);
        $this->assertDatabaseHas('research_images', ['id' => $copy->id, 'source_user_id' => null, 'revoked_at' => null]);
        Storage::disk('local')->assertMissing('diagnoses/research-source.jpg');
        Storage::disk('local')->assertExists($path);
    }

    public function test_account_deletion_can_remove_approved_research_copies(): void
    {
        [$farmer, , , , $copy] = $this->approvedCopy();
        $path = $copy->image_path;
        Sanctum::actingAs($farmer);
        $this->deleteJson('/api/profile', [
            'current_password' => 'Correct123!', 'remove_research_copies' => true,
        ])->assertNoContent();

        $this->assertDatabaseHas('research_images', ['id' => $copy->id, 'source_user_id' => null, 'image_path' => null]);
        $this->assertNotNull($copy->fresh()->revoked_at);
        Storage::disk('local')->assertMissing($path);
    }

    public function test_disabling_account_research_sharing_removes_approved_copy_after_scan_deletion(): void
    {
        [$farmer, , $diagnosis, , $copy] = $this->approvedCopy();
        $path = $copy->image_path;
        Sanctum::actingAs($farmer);
        $this->deleteJson("/api/diagnoses/{$diagnosis->id}")->assertNoContent();
        $this->assertTrue(Diagnosis::withTrashed()->findOrFail($diagnosis->id)->trashed());
        Storage::disk('local')->assertExists($path);

        $this->putJson('/api/profile/research-consent', ['research_photo_consent' => false])
            ->assertOk()->assertJsonPath('data.user.research_photo_consent', false);

        $this->assertNotNull($copy->fresh()->revoked_at);
        Storage::disk('local')->assertMissing($path);
        $this->assertNotNull(Diagnosis::withTrashed()->findOrFail($diagnosis->id)->research_consent_withdrawn_at);
    }

    public function test_staff_removal_records_reason_and_blocks_private_photo_access(): void
    {
        [$farmer, $admin, , $candidate, $copy] = $this->approvedCopy();
        Sanctum::actingAs($farmer);
        $this->deleteJson('/api/admin/research-images/'.$copy->id, ['reason' => 'Correction'])->assertForbidden();

        Sanctum::actingAs($admin);
        $this->deleteJson('/api/admin/research-images/'.$copy->id, ['reason' => ''])->assertUnprocessable();
        $this->deleteJson('/api/admin/research-images/'.$copy->id, ['reason' => 'Farmer request'])
            ->assertOk()->assertJsonPath('data.revocation_reason', 'Farmer request');
        $this->assertDatabaseHas('dataset_candidates', ['id' => $candidate->id, 'status' => 'rejected']);
        $this->get('/api/admin/research-images/'.$copy->id.'/photo')->assertNotFound();
    }

    public function test_old_consent_must_be_renewed_before_separate_copy_is_approved(): void
    {
        [$farmer, $admin, $diagnosis, $candidate, $copy] = $this->approvedCopy();
        $this->deleteJson('/api/admin/research-images/'.$copy->id, ['reason' => 'Reset for consent test'])->assertOk();
        $diagnosis->update(['research_consent_version' => 'research-image-consent-v1']);
        $this->putJson("/api/admin/dataset-candidates/{$candidate->id}", ['status' => 'approved'])
            ->assertUnprocessable()->assertJsonValidationErrors('status');
        Sanctum::actingAs($farmer);
        $this->postJson("/api/diagnoses/{$diagnosis->id}/research-consent")
            ->assertOk()->assertJsonPath('data.research_consent_current', true);
        Sanctum::actingAs($admin);
        $this->putJson("/api/admin/dataset-candidates/{$candidate->id}", ['status' => 'approved'])
            ->assertOk();
        $this->assertDatabaseCount('research_images', 2);
    }
}
