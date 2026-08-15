<?php

namespace Tests\Feature;

use App\Models\Disease;
use App\Services\DiseaseVerificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_health_endpoint_identifies_authoritative_service(): void
    {
        $this->getJson('/api/health')->assertOk()->assertJson(['service' => 'dahonmd-api']);
    }

    public function test_source_verified_development_catalog_is_seeded_and_published(): void
    {
        $this->seed();
        $this->seed();

        $this->getJson('/api/diseases')
            ->assertOk()
            ->assertJsonCount(4, 'data')
            ->assertJsonPath('data.0.slug', 'healthy')
            ->assertJsonPath('data.1.slug', 'dead')
            ->assertJsonPath('data.1.name', 'Dead Leaf')
            ->assertJsonPath('data.0.sources_count', 3)
            ->assertJsonStructure(['data' => [['sources' => [['title', 'authors', 'reference_url']]]]]);

        $this->assertDatabaseCount('diseases', 5);
        $this->assertDatabaseCount('disease_symptoms', 9);
        $this->assertDatabaseCount('disease_management', 10);
        $this->assertDatabaseCount('research_sources', 8);
        $this->assertDatabaseCount('disease_evidence', 22);
        $this->assertDatabaseCount('pesticide_regulatory_checks', 0);
        $this->assertDatabaseCount('disease_verifications', 4);
        $this->assertDatabaseHas('diseases', [
            'slug' => 'sigatoka', 'model_class_key' => 'sigatoka', 'is_verified' => true,
        ]);
        $this->assertDatabaseHas('diseases', [
            'slug' => 'panama-disease', 'model_class_key' => 'panama-disease', 'verification_status' => 'draft', 'is_verified' => false,
        ]);

        $verification = app(DiseaseVerificationService::class);
        Disease::query()->where('is_verified', true)->each(fn (Disease $disease) => $verification->assertVerifiable($disease));
    }
}
