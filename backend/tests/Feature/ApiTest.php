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
            ->assertJsonCount(5, 'data')
            ->assertJsonPath('data.0.slug', 'healthy')
            ->assertJsonPath('data.1.slug', 'dead')
            ->assertJsonPath('data.1.name', 'Dead Leaf')
            ->assertJsonPath('data.0.sources_count', 3)
            ->assertJsonStructure(['data' => [['sources' => [['title', 'authors', 'reference_url']]]]]);

        $this->assertDatabaseCount('diseases', 5);
        $this->assertDatabaseCount('disease_symptoms', 13);
        $this->assertDatabaseCount('disease_management', 15);
        $this->assertDatabaseCount('research_sources', 8);
        $this->assertDatabaseCount('disease_evidence', 29);
        $this->assertDatabaseCount('pesticide_regulatory_checks', 1);
        $this->assertDatabaseCount('disease_verifications', 5);

        $verification = app(DiseaseVerificationService::class);
        Disease::query()->each(fn (Disease $disease) => $verification->assertVerifiable($disease));
    }
}
