<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_health_endpoint_identifies_web_service(): void
    {
        $this->getJson('/api/health')->assertOk()->assertJson(['service' => 'bananacare-web-api']);
    }

    public function test_disease_catalog_is_available(): void
    {
        $this->seed();
        $this->getJson('/api/diseases')->assertOk()->assertJsonCount(5, 'data');
    }
}
