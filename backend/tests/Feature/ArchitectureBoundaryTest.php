<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ArchitectureBoundaryTest extends TestCase
{
    use RefreshDatabase;

    public function test_legacy_web_inference_uses_the_standard_api_response_contract(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => User::ROLE_FARMER]));

        $this->postJson('/api/inference', [
            'image' => UploadedFile::fake()->image('leaf.jpg', 224, 224),
        ])->assertOk()->assertJsonStructure([
            'success',
            'message',
            'data' => [
                'diseaseId',
                'confidence',
                'latency',
                'model',
                'probabilities',
                'is_simulated',
                'is_uncertain',
                'content_status',
            ],
        ])->assertJsonPath('success', true);
    }
}
