<?php

namespace App\Http\Controllers\Expert;

use App\Http\Controllers\Controller;
use App\Http\Resources\DiagnosisResource;
use App\Models\Diagnosis;
use App\Models\DiagnosisReview;
use App\Models\Disease;
use App\Services\ReviewPriorityService;
use Illuminate\Http\JsonResponse;

class DashboardController extends Controller
{
    public function __construct(private readonly ReviewPriorityService $priorityService) {}

    public function __invoke(): JsonResponse
    {
        $threshold = (float) config('banana.confidence_threshold');
        $pendingRequests = DiagnosisReview::query()->where('review_status', 'pending')->count();
        $uncertain = Diagnosis::query()->where('confidence', '<', $threshold)
            ->whereDoesntHave('review', fn ($query) => $query->where('review_status', '!=', 'pending'))
            ->count();
        $caseQuery = Diagnosis::query()
            ->where(function ($query) use ($threshold) {
                $query->where('confidence', '<', $threshold)
                    ->orWhereHas('review', fn ($review) => $review->where('review_status', 'pending'));
            })
            ->whereDoesntHave('review', fn ($query) => $query->where('review_status', '!=', 'pending'));
        $needsReview = (clone $caseQuery)->count();
        $cases = $caseQuery->with(['user', 'disease', 'review.expert'])->latest('diagnosed_at')->limit(100)->get();
        $cases = $this->priorityService->rank($cases)->take(6);

        return response()->json(['success' => true, 'message' => 'Agricultural review dashboard retrieved.', 'data' => [
            'needs_review' => $needsReview,
            'uncertain_results' => $uncertain,
            'farmer_review_requests' => $pendingRequests,
            'disease_content_awaiting_verification' => Disease::query()->where('verification_status', 'researched')->count(),
            'cases' => DiagnosisResource::collection($cases),
        ]]);
    }
}
