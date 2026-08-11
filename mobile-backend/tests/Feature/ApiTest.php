<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_health_endpoint_identifies_mobile_service(): void
    {
        $this->getJson('/api/health')->assertOk()->assertJson(['service' => 'bananacare-mobile-api']);
    }

    public function test_mobile_authentication_and_profile(): void
    {
        $register = $this->postJson('/api/auth/register', ['name' => 'Mobile User', 'email' => 'mobile@example.test', 'password' => 'secret123', 'password_confirmation' => 'secret123'])->assertCreated();
        $this->withToken($register->json('data.token'))->getJson('/api/auth/me')->assertOk()->assertJsonPath('data.user.email', 'mobile@example.test');
    }

    public function test_batch_sync_is_authenticated_and_idempotent(): void
    {
        $this->seed();
        $payload = ['diagnoses' => [[
            'id' => '550e8400-e29b-41d4-a716-446655440000', 'diseaseId' => 'black-sigatoka', 'confidence' => 94.2,
            'latency' => 84, 'modelVersion' => 'EMV3-INT8 demo', 'diagnosedAt' => now()->toIso8601String(),
        ]]];

        $this->postJson('/api/sync', $payload)->assertUnauthorized();
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/sync', $payload)->assertOk()->assertJsonPath('data.results.0.status', 'created');
        $this->postJson('/api/sync', $payload)->assertOk()->assertJsonPath('data.results.0.status', 'already_synchronized');
        $this->assertDatabaseCount('mobile_diagnoses', 1);
    }
}
