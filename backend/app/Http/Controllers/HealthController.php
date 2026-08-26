<?php

namespace App\Http\Controllers;

use App\Services\HealthCheckService;
use Illuminate\Http\JsonResponse;

class HealthController extends Controller
{
    public function __construct(private readonly HealthCheckService $health) {}

    public function __invoke(): JsonResponse
    {
        $result = $this->health->check();

        return response()->json($result['body'], $result['status']);
    }
}
