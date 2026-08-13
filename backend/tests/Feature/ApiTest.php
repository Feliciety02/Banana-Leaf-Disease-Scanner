<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_health_endpoint_identifies_web_service(): void
    {
        $this->getJson('/api/health')->assertOk()->assertJson(['service' => 'dahonmd-web-api']);
    }

    public function test_farmer_catalog_does_not_publish_unverified_or_seeded_content(): void
    {
        $this->seed();
        $this->getJson('/api/diseases')->assertOk()->assertJsonCount(0, 'data');
        $this->assertDatabaseCount('diseases', 0);
    }
}
