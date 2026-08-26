<?php

namespace App\Http\Controllers;

use App\Http\Resources\DiagnosisResource;
use App\Services\DashboardService;
use Illuminate\Http\JsonResponse;

class DashboardController extends Controller
{
    public function __construct(private readonly DashboardService $dashboard) {}

    public function __invoke(): JsonResponse
    {
        $data = $this->dashboard->analytics();
        $data['recent_diagnoses'] = DiagnosisResource::collection($data['recent_diagnoses']);

        return response()->json(['success' => true, 'message' => 'Dashboard analytics retrieved.', 'data' => $data]);
    }
}
