<?php

namespace Tests\Feature;

use App\Models\Diagnosis;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OfflineSynchronizationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['banana.label_map_path' => base_path('tests/fixtures/label_map.json')]);
    }

    public function test_generic_sync_accepts_web_or_mobile_outboxes_and_returns_server_ids(): void
    {
        $user = User::factory()->farmer()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/sync', ['diagnoses' => [[
            'sync_uuid' => '905337f0-1e51-4ad5-83b0-f9b190828d55',
            'predicted_class' => 'healthy',
            'confidence' => 91.25,
            'source' => 'web',
            'diagnosed_at' => now()->toIso8601String(),
        ]]])->assertOk()
            ->assertJsonPath('data.results.0.status', 'created')
            ->assertJsonPath('data.results.0.sync_uuid', '905337f0-1e51-4ad5-83b0-f9b190828d55');

        $diagnosis = Diagnosis::query()->sole();
        $this->assertSame($diagnosis->id, $response->json('data.results.0.diagnosis_id'));
        $this->assertSame('web', $diagnosis->source);

        $this->postJson('/api/sync', ['diagnoses' => [[
            'sync_uuid' => $diagnosis->sync_uuid,
            'predicted_class' => 'healthy',
            'confidence' => 91.25,
            'source' => 'web',
            'diagnosed_at' => $diagnosis->diagnosed_at->toIso8601String(),
        ]]])->assertOk()
            ->assertJsonPath('data.results.0.status', 'already_synchronized')
            ->assertJsonPath('data.results.0.diagnosis_id', $diagnosis->id);

        $this->assertDatabaseCount('diagnoses', 1);

        $this->postJson('/api/sync', ['diagnoses' => [[
            'sync_uuid' => $diagnosis->sync_uuid,
            'predicted_class' => 'sigatoka',
            'confidence' => 91.25,
            'source' => 'web',
            'diagnosed_at' => $diagnosis->diagnosed_at->toIso8601String(),
        ]]])->assertOk()
            ->assertJsonPath('data.results.0.status', 'rejected')
            ->assertJsonPath('data.results.0.diagnosis_id', null);
        $this->assertDatabaseCount('diagnoses', 1);
        $this->assertDatabaseHas('diagnoses', ['id' => $diagnosis->id, 'predicted_class' => 'healthy']);
    }

    public function test_partial_batch_failure_does_not_discard_valid_offline_records(): void
    {
        Sanctum::actingAs(User::factory()->farmer()->create());

        $this->postJson('/api/sync', ['diagnoses' => [
            [
                'sync_uuid' => '0bdd7f58-2fd3-4900-8221-17ccaf43303c',
                'predicted_class' => 'sigatoka',
                'confidence' => 74.5,
                'diagnosed_at' => now()->toIso8601String(),
            ],
            [
                'sync_uuid' => 'a2d10507-528c-49e7-ad18-046b3c17f7bf',
                'predicted_class' => 'not-a-model-class',
                'confidence' => 74.5,
                'diagnosed_at' => now()->toIso8601String(),
            ],
        ]])->assertOk()
            ->assertJsonPath('data.results.0.status', 'created')
            ->assertJsonPath('data.results.1.status', 'rejected')
            ->assertJsonStructure(['data' => ['results' => [1 => ['errors' => ['predicted_class']]]]]);

        $this->assertDatabaseCount('diagnoses', 1);
    }

    public function test_sync_uuid_cannot_be_claimed_by_another_account(): void
    {
        $owner = User::factory()->farmer()->create();
        $other = User::factory()->farmer()->create();
        $uuid = 'd219b7c2-ee9d-41dd-90ea-e42fd080f273';
        Diagnosis::query()->create([
            'user_id' => $owner->id,
            'predicted_class' => 'healthy',
            'confidence' => 88,
            'source' => 'mobile',
            'sync_uuid' => $uuid,
            'sync_status' => 'synced',
            'diagnosed_at' => now(),
        ]);
        Sanctum::actingAs($other);

        $this->postJson('/api/sync', ['diagnoses' => [[
            'sync_uuid' => $uuid,
            'predicted_class' => 'healthy',
            'confidence' => 88,
            'diagnosed_at' => now()->toIso8601String(),
        ]]])->assertOk()
            ->assertJsonPath('data.results.0.status', 'rejected')
            ->assertJsonPath('data.results.0.diagnosis_id', null)
            ->assertJsonStructure(['data' => ['results' => [0 => ['errors' => ['sync_uuid']]]]]);

        $this->assertDatabaseCount('diagnoses', 1);
    }

    public function test_offline_review_image_requires_a_pending_review_request(): void
    {
        Storage::fake('local');
        $user = User::factory()->farmer()->create();
        Sanctum::actingAs($user);
        $uuid = 'b2a899e8-7a07-46f5-ab33-760e226f9633';

        $response = $this->postJson('/api/sync', ['diagnoses' => [[
            'sync_uuid' => $uuid,
            'predicted_class' => 'healthy',
            'confidence' => 67,
            'source' => 'web',
            'diagnosed_at' => now()->toIso8601String(),
        ]]])->assertOk();
        $diagnosisId = $response->json('data.results.0.diagnosis_id');

        $this->post("/api/sync/{$uuid}/image", [
            'purpose' => 'review',
            'image' => UploadedFile::fake()->image('premature.jpg'),
        ])->assertUnprocessable();

        $this->postJson("/api/diagnoses/{$diagnosisId}/review-request")->assertOk();
        $this->post("/api/sync/{$uuid}/image", [
            'purpose' => 'review',
            'image' => UploadedFile::fake()->image('review.jpg'),
        ])->assertOk();

        $diagnosis = Diagnosis::query()->findOrFail($diagnosisId);
        $this->assertNotNull($diagnosis->image_path);
        $this->assertFalse($diagnosis->hasActiveResearchConsent());
        Storage::disk('local')->assertExists($diagnosis->image_path);
    }

    public function test_incremental_pull_returns_review_updates_and_deletion_tombstones(): void
    {
        $user = User::factory()->farmer()->create();
        Sanctum::actingAs($user);
        $diagnosis = Diagnosis::query()->create([
            'user_id' => $user->id,
            'predicted_class' => 'healthy',
            'confidence' => 92,
            'source' => 'mobile',
            'sync_uuid' => '62e92d82-9204-483f-ad75-68eb2c40c537',
            'sync_status' => 'synced',
            'diagnosed_at' => now(),
        ]);

        $initial = $this->getJson('/api/sync')
            ->assertOk()
            ->assertJsonPath('data.changes.0.type', 'upsert')
            ->assertJsonPath('data.changes.0.diagnosis.id', $diagnosis->id)
            ->assertJsonPath('data.has_more', false);
        $initialCursor = $initial->json('data.next_cursor');

        $this->getJson('/api/sync?cursor='.urlencode($initialCursor))
            ->assertOk()
            ->assertJsonCount(0, 'data.changes')
            ->assertJsonPath('data.next_cursor', $initialCursor);

        $this->postJson("/api/diagnoses/{$diagnosis->id}/review-request")->assertOk();
        $reviewUpdate = $this->getJson('/api/sync?cursor='.urlencode($initialCursor))
            ->assertOk()
            ->assertJsonPath('data.changes.0.type', 'upsert')
            ->assertJsonPath('data.changes.0.diagnosis.review.review_status', 'pending');
        $reviewCursor = $reviewUpdate->json('data.next_cursor');

        $this->postJson('/api/sync', ['deletions' => [[
            'server_id' => $diagnosis->id,
            'sync_uuid' => $diagnosis->sync_uuid,
        ]]])->assertOk()
            ->assertJsonPath('data.deletion_results.0.status', 'deleted');

        $this->getJson('/api/sync?cursor='.urlencode($reviewCursor))
            ->assertOk()
            ->assertJsonPath('data.changes.0.type', 'delete')
            ->assertJsonPath('data.changes.0.server_id', $diagnosis->id)
            ->assertJsonPath('data.changes.0.sync_uuid', $diagnosis->sync_uuid);
        $this->assertSoftDeleted('diagnoses', ['id' => $diagnosis->id]);

        $this->postJson('/api/sync', ['deletions' => [['server_id' => $diagnosis->id]]])
            ->assertOk()
            ->assertJsonPath('data.deletion_results.0.status', 'already_deleted');

        $this->postJson('/api/sync', ['diagnoses' => [[
            'sync_uuid' => $diagnosis->sync_uuid,
            'predicted_class' => $diagnosis->predicted_class,
            'confidence' => $diagnosis->confidence,
            'source' => $diagnosis->source,
            'diagnosed_at' => $diagnosis->diagnosed_at->toIso8601String(),
        ]]])->assertOk()
            ->assertJsonPath('data.results.0.status', 'already_synchronized')
            ->assertJsonPath('data.results.0.diagnosis_id', $diagnosis->id);
        $this->assertSoftDeleted('diagnoses', ['id' => $diagnosis->id]);
    }

    public function test_deletion_sync_cannot_delete_another_accounts_diagnosis(): void
    {
        $owner = User::factory()->farmer()->create();
        $other = User::factory()->farmer()->create();
        $diagnosis = Diagnosis::query()->create([
            'user_id' => $owner->id,
            'predicted_class' => 'healthy',
            'confidence' => 89,
            'source' => 'web',
            'sync_uuid' => 'cf466dc2-dc7d-4919-8f07-b68aafed09e5',
            'sync_status' => 'synced',
            'diagnosed_at' => now(),
        ]);
        Sanctum::actingAs($other);

        $this->postJson('/api/sync', ['deletions' => [[
            'server_id' => $diagnosis->id,
            'sync_uuid' => $diagnosis->sync_uuid,
        ]]])->assertOk()
            ->assertJsonPath('data.deletion_results.0.status', 'rejected');

        $this->assertDatabaseHas('diagnoses', ['id' => $diagnosis->id, 'deleted_at' => null]);
        $this->getJson('/api/sync')->assertOk()->assertJsonCount(0, 'data.changes');
    }

    public function test_uuid_only_deletion_resolves_an_ambiguous_upload_acknowledgement(): void
    {
        $user = User::factory()->farmer()->create();
        Sanctum::actingAs($user);
        $uuid = '9715b43d-ab20-453c-adbb-cfa6ad3029ca';
        $created = $this->postJson('/api/sync', ['diagnoses' => [[
            'sync_uuid' => $uuid,
            'predicted_class' => 'healthy',
            'confidence' => 90,
            'diagnosed_at' => now()->toIso8601String(),
        ]]])->assertOk();

        $this->postJson('/api/sync', ['deletions' => [['sync_uuid' => $uuid]]])
            ->assertOk()
            ->assertJsonPath('data.deletion_results.0.status', 'deleted')
            ->assertJsonPath('data.deletion_results.0.server_id', $created->json('data.results.0.diagnosis_id'));
        $this->assertSoftDeleted('diagnoses', ['sync_uuid' => $uuid]);

        $this->postJson('/api/sync', ['deletions' => [[
            'sync_uuid' => '52a77279-dd58-4b76-926c-47a6ea5ddaf8',
        ]]])->assertOk()->assertJsonPath('data.deletion_results.0.status', 'already_deleted');
    }

    public function test_pull_rejects_an_invalid_cursor(): void
    {
        Sanctum::actingAs(User::factory()->farmer()->create());

        $this->getJson('/api/v1/sync')->assertOk()->assertJsonCount(0, 'data.changes');
        $this->getJson('/api/sync?cursor=not-a-cursor')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('cursor');
    }

    public function test_pull_cursor_pages_without_skipping_changes(): void
    {
        $user = User::factory()->farmer()->create();
        Sanctum::actingAs($user);
        foreach ([
            ['uuid' => 'f82ffb04-daf7-4a84-ac64-d265b08a43dc', 'class' => 'healthy'],
            ['uuid' => '62cde711-fe30-419e-9e9b-a651c198dc97', 'class' => 'sigatoka'],
        ] as $record) {
            Diagnosis::query()->create([
                'user_id' => $user->id,
                'predicted_class' => $record['class'],
                'confidence' => 85,
                'source' => 'mobile',
                'sync_uuid' => $record['uuid'],
                'sync_status' => 'synced',
                'diagnosed_at' => now(),
            ]);
        }

        $first = $this->getJson('/api/sync?limit=1')
            ->assertOk()
            ->assertJsonCount(1, 'data.changes')
            ->assertJsonPath('data.has_more', true);
        $second = $this->getJson('/api/sync?limit=1&cursor='.urlencode($first->json('data.next_cursor')))
            ->assertOk()
            ->assertJsonCount(1, 'data.changes')
            ->assertJsonPath('data.has_more', false);

        $this->assertNotSame(
            $first->json('data.changes.0.diagnosis.sync_uuid'),
            $second->json('data.changes.0.diagnosis.sync_uuid'),
        );
    }
}
