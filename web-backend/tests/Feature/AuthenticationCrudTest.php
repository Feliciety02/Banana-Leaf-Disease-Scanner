<?php

namespace Tests\Feature;

use App\Models\Diagnosis;
use App\Models\Disease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuthenticationCrudTest extends TestCase
{
    use RefreshDatabase;

    private function disease(array $overrides = []): Disease
    {
        return Disease::query()->create([...[
            'slug' => 'placeholder-class', 'name' => 'Placeholder class', 'description' => 'Development placeholder.',
            'symptoms' => ['Placeholder symptom'], 'management' => 'Pending research validation.',
        ], ...$overrides]);
    }

    private function diagnosis(User $user, array $overrides = []): Diagnosis
    {
        return Diagnosis::query()->create([...[
            'user_id' => $user->id, 'disease_id' => null, 'predicted_class' => 'placeholder-class',
            'confidence' => 91.2, 'model_version' => 'demo', 'inference_time_ms' => 80,
            'source' => 'web', 'diagnosed_at' => now(),
        ], ...$overrides]);
    }

    public function test_registration_login_duplicate_credentials_and_logout(): void
    {
        $this->getJson('/api/profile')->assertUnauthorized();
        $payload = ['name' => 'Field User', 'email' => 'field@example.test', 'password' => 'secret123', 'password_confirmation' => 'secret123'];
        $response = $this->postJson('/api/auth/register', $payload)->assertCreated()->assertJsonPath('data.user.role', 'user');
        $this->postJson('/api/auth/register', $payload)->assertUnprocessable()->assertJsonPath('success', false);
        $this->postJson('/api/auth/login', ['email' => $payload['email'], 'password' => 'wrong-password'])->assertUnprocessable();
        $login = $this->postJson('/api/auth/login', ['email' => $payload['email'], 'password' => $payload['password']])->assertOk();
        $this->withToken($login->json('data.token'))->getJson('/api/auth/me')->assertOk()->assertJsonPath('data.user.email', $payload['email']);
        $this->withToken($login->json('data.token'))->postJson('/api/auth/logout')->assertOk();
        $this->assertDatabaseCount('personal_access_tokens', 1);
        $this->assertNotEmpty($response->json('data.token'));
    }

    public function test_profile_update_and_password_require_current_password(): void
    {
        $user = User::factory()->create(['password' => 'secret123']);
        Sanctum::actingAs($user);
        $this->putJson('/api/profile', ['name' => 'Updated Name', 'email' => 'updated@example.test'])->assertOk()->assertJsonPath('data.user.name', 'Updated Name');
        $this->putJson('/api/profile/password', ['current_password' => 'wrong', 'password' => 'changed123', 'password_confirmation' => 'changed123'])->assertUnprocessable();
        $this->putJson('/api/profile/password', ['current_password' => 'secret123', 'password' => 'changed123', 'password_confirmation' => 'changed123'])->assertOk();
    }

    public function test_users_only_access_and_delete_their_own_diagnoses(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $own = $this->diagnosis($owner);
        $foreign = $this->diagnosis($other);
        Sanctum::actingAs($owner);

        $this->getJson('/api/diagnoses')->assertOk()->assertJsonCount(1, 'data.items');
        $this->getJson("/api/diagnoses/{$foreign->id}")->assertForbidden();
        $this->deleteJson("/api/diagnoses/{$foreign->id}")->assertForbidden();
        $this->deleteJson("/api/diagnoses/{$own->id}")->assertNoContent();
    }

    public function test_user_can_create_diagnosis_without_trusting_client_user_id(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        Sanctum::actingAs($user);
        $this->postJson('/api/diagnoses', [
            'user_id' => $other->id, 'predicted_class' => 'placeholder-class', 'confidence' => 80,
            'model_version' => 'demo', 'inference_time_ms' => 30, 'source' => 'web', 'diagnosed_at' => now()->toIso8601String(),
        ])->assertCreated();
        $this->assertDatabaseHas('diagnoses', ['user_id' => $user->id, 'predicted_class' => 'placeholder-class']);
    }

    public function test_admin_authorization_user_management_and_system_diagnoses(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $this->getJson('/api/admin/users')->assertForbidden();

        $admin = User::factory()->admin()->create();
        $this->diagnosis($user);
        Sanctum::actingAs($admin);
        $this->getJson('/api/admin/users')->assertOk();
        $this->getJson('/api/admin/diagnoses')->assertOk()->assertJsonCount(1, 'data.items');
        $this->deleteJson("/api/admin/users/{$admin->id}")->assertUnprocessable();
    }

    public function test_disease_information_permissions(): void
    {
        $disease = $this->disease();
        $this->getJson('/api/diseases')->assertOk();
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $this->postJson('/api/admin/diseases', [])->assertForbidden();

        Sanctum::actingAs(User::factory()->admin()->create());
        $created = $this->postJson('/api/admin/diseases', [
            'slug' => 'placeholder-two', 'name' => 'Placeholder two', 'description' => 'Pending label map.',
            'symptoms' => ['Pending'], 'management' => 'Pending research validation.',
        ])->assertCreated();
        $id = $created->json('data.id');
        $this->putJson("/api/admin/diseases/{$id}", [
            'slug' => 'placeholder-two', 'name' => 'Updated placeholder', 'description' => 'Pending label map.',
            'symptoms' => ['Pending'], 'management' => 'Pending research validation.',
        ])->assertOk();
        $this->deleteJson("/api/admin/diseases/{$id}")->assertNoContent();
        $this->assertDatabaseHas('diseases', ['id' => $disease->id]);
    }

    public function test_mobile_sync_uuid_is_idempotent(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $payload = ['diagnoses' => [[
            'sync_uuid' => '550e8400-e29b-41d4-a716-446655440000', 'predicted_class' => 'placeholder-class',
            'confidence' => 90, 'model_version' => 'demo', 'inference_time_ms' => 40, 'diagnosed_at' => now()->toIso8601String(),
        ]]];
        $this->postJson('/api/mobile/sync', $payload)->assertOk()->assertJsonPath('data.results.0.status', 'created');
        $this->postJson('/api/mobile/sync', $payload)->assertOk()->assertJsonPath('data.results.0.status', 'already_synchronized');
        $this->assertDatabaseCount('diagnoses', 1);
    }

    public function test_one_identity_mobile_sync_web_history_admin_analytics_and_cross_user_authorization(): void
    {
        $credentials = [
            'name' => 'Cross Platform User',
            'email' => 'shared@example.test',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
        ];

        $registration = $this->postJson('/api/auth/register', $credentials)->assertCreated();
        $mobileToken = $registration->json('data.token');
        $userId = $registration->json('data.user.id');

        $webLogin = $this->postJson('/api/auth/login', [
            'email' => $credentials['email'],
            'password' => $credentials['password'],
            'device_name' => 'web-browser',
        ])->assertOk()->assertJsonPath('data.user.id', $userId);
        $webToken = $webLogin->json('data.token');

        $syncPayload = ['diagnoses' => [[
            'sync_uuid' => 'f09e7c28-e57b-4db0-a553-1e6bded2cf61',
            'predicted_class' => 'simulated-placeholder',
            'confidence' => 88.5,
            'model_version' => 'simulated-mobile-adapter',
            'inference_time_ms' => 73,
            'diagnosed_at' => now()->toIso8601String(),
        ]]];

        $this->withToken($mobileToken)->postJson('/api/mobile/sync', $syncPayload)
            ->assertOk()->assertJsonPath('data.results.0.status', 'created');
        $this->withToken($mobileToken)->postJson('/api/mobile/sync', $syncPayload)
            ->assertOk()->assertJsonPath('data.results.0.status', 'already_synchronized');
        $this->assertDatabaseCount('diagnoses', 1);

        $history = $this->withToken($webToken)->getJson('/api/diagnoses')->assertOk();
        $history->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.sync_uuid', $syncPayload['diagnoses'][0]['sync_uuid'])
            ->assertJsonPath('data.items.0.source', 'mobile');

        $diagnosisId = $history->json('data.items.0.id');
        Sanctum::actingAs(User::factory()->admin()->create());
        $this->getJson('/api/admin/dashboard')->assertOk()
            ->assertJsonPath('data.total_diagnoses', 1)
            ->assertJsonPath('data.diagnoses_per_source.mobile', 1);

        Sanctum::actingAs(User::factory()->create());
        $this->getJson("/api/diagnoses/{$diagnosisId}")->assertForbidden();
    }
}
