<?php

namespace App\Http\Controllers\Expert;

use App\Http\Controllers\Controller;
use App\Http\Resources\DiagnosisResource;
use App\Models\Diagnosis;
use App\Services\ReviewPriorityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DiagnosisReviewController extends Controller
{
    public function __construct(private readonly ReviewPriorityService $priorityService) {}

    public function index(Request $request): JsonResponse
    {
        $scope = $request->string('scope', 'pending')->toString();
        $threshold = (float) config('banana.confidence_threshold');
        $query = Diagnosis::query()->with(['user', 'disease', 'review.expert'])->latest('diagnosed_at');

        if ($scope === 'reviewed') {
            $query->whereHas('review', fn ($review) => $review->where('review_status', '!=', 'pending'));
        } else {
            $query->where(function ($cases) use ($threshold) {
                $cases->where('confidence', '<', $threshold)
                    ->orWhereHas('review', fn ($review) => $review->where('review_status', 'pending'));
            })->whereDoesntHave('review', fn ($review) => $review->where('review_status', '!=', 'pending'));
        }

        $diagnoses = $query->limit(100)->get();
        if ($scope !== 'reviewed') {
            $diagnoses = $this->priorityService->rank($diagnoses);
        }

        return response()->json(['success' => true, 'message' => 'Diagnosis review cases retrieved.', 'data' => DiagnosisResource::collection($diagnoses)]);
    }

    public function show(Diagnosis $diagnosis): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'Diagnosis review case retrieved.', 'data' => new DiagnosisResource($diagnosis->load(['user', 'disease', 'review.expert']))]);
    }

    public function update(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        $data = $request->validate([
            'review_status' => ['required', Rule::in(['confirmed', 'alternate_class', 'cannot_determine', 'field_or_laboratory_required', 'possible_outside_supported_classes'])],
            'verified_label' => ['nullable', 'string', 'max:255', Rule::requiredIf($request->input('review_status') === 'alternate_class'), Rule::exists('diseases', 'model_class_key')],
            'image_quality' => ['required', Rule::in(['good', 'blurry', 'poor_lighting', 'disease_area_not_visible', 'insufficient_image'])],
            'next_steps' => ['required', 'array', 'min:1'],
            'next_steps.*' => ['required', 'distinct', Rule::in(['retake_photo', 'monitor_plant', 'isolate_affected_plant', 'seek_field_inspection', 'other'])],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        if ($data['review_status'] !== 'alternate_class') {
            $data['verified_label'] = $data['review_status'] === 'confirmed' ? $diagnosis->predicted_class : null;
        }

        $review = $diagnosis->review()->updateOrCreate(
            ['diagnosis_id' => $diagnosis->id],
            [...$data, 'expert_id' => $request->user()->id, 'requires_field_inspection' => $data['review_status'] === 'field_or_laboratory_required' || in_array('seek_field_inspection', $data['next_steps'], true), 'reviewed_at' => now()],
        );

        return response()->json(['success' => true, 'message' => 'Agricultural reviewer assessment saved without changing the original AI prediction.', 'data' => new DiagnosisResource($diagnosis->load(['user', 'disease', 'review.expert']))]);
    }
}
