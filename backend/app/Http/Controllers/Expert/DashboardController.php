<?php

namespace App\Http\Controllers\Expert;

use App\Http\Controllers\Controller;
use App\Http\Resources\DiagnosisResource;
use App\Services\ExpertReviewService;
use Illuminate\Http\JsonResponse;

class DashboardController extends Controller
{
    public function __construct(private readonly ExpertReviewService $reviews) {}

    public function __invoke(): JsonResponse
    {
        $data = $this->reviews->dashboard();
        $data['cases'] = DiagnosisResource::collection($data['cases']);

        return response()->json(['success' => true, 'message' => 'Agricultural review dashboard retrieved.', 'data' => $data]);
    }
}
