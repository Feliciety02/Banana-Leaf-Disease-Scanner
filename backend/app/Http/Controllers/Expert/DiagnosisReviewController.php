<?php

namespace App\Http\Controllers\Expert;

use App\Http\Controllers\Controller;
use App\Http\Resources\DiagnosisResource;
use App\Models\Diagnosis;
use App\Services\ExpertReviewService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class DiagnosisReviewController extends Controller
{
    public function __construct(private readonly ExpertReviewService $reviews) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'Diagnosis review cases retrieved.', 'data' => DiagnosisResource::collection(
            $this->reviews->cases($request->string('scope', 'pending')->toString())
        )]);
    }

    public function show(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        $history = $this->reviews->farmerHistory($diagnosis)->map(fn (Diagnosis $item) => [
            'id' => $item->id,
            'predicted_class' => $item->predicted_class,
            'confidence' => $item->confidence,
            'diagnosed_at' => $item->diagnosed_at,
            'has_photo' => (bool) $item->image_path,
            'review_status' => $item->review?->review_status,
            'verified_label' => $item->review?->verified_label,
        ])->values();

        return response()->json(['success' => true, 'message' => 'Diagnosis review case retrieved.', 'data' => [
            ...(new DiagnosisResource($this->reviews->details($diagnosis)))->resolve($request),
            'farmer_history' => $history,
        ]]);
    }

    public function claim(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        $claim = $this->reviews->claim($request->user(), $diagnosis);

        return response()->json(['success' => true, 'message' => 'You are reviewing this case.', 'data' => [
            'user' => $claim->user?->only(['id', 'name']),
            'expires_at' => $claim->expires_at->toIso8601String(),
        ]]);
    }

    public function release(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        $this->reviews->release($request->user(), $diagnosis);

        return response()->json(['success' => true, 'message' => 'Case released.', 'data' => (object) []]);
    }

    public function update(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        $data = $request->validate([
            'review_status' => ['required', Rule::in(['confirmed', 'alternate_class', 'cannot_determine', 'field_or_laboratory_required', 'possible_outside_supported_classes'])],
            'verified_label' => ['nullable', 'string', 'max:255', Rule::requiredIf($request->input('review_status') === 'alternate_class'), Rule::in(config('banana.class_labels', []))],
            'image_quality' => ['required', Rule::in(['good', 'blurry', 'poor_lighting', 'disease_area_not_visible', 'insufficient_image'])],
            'next_steps' => ['required', 'array', 'min:1'],
            'next_steps.*' => ['required', 'distinct', Rule::in(['retake_photo', 'monitor_plant', 'isolate_affected_plant', 'seek_field_inspection', 'other'])],
            'notes' => ['nullable', 'string', 'max:5000'],
            'farmer_message' => ['nullable', 'string', 'max:2000'],
            'expected_review_version' => ['sometimes', 'integer', 'min:0'],
            'revision_reason' => ['nullable', 'string', 'max:500'],
        ]);

        if (! $diagnosis->image_path && $data['review_status'] !== 'cannot_determine') {
            throw ValidationException::withMessages([
                'review_status' => 'A scan photo is required for a disease or other-condition assessment. Choose cannot determine when no photo is available.',
            ]);
        }

        $diagnosis = $this->reviews->save($request->user(), $diagnosis, $data);

        return response()->json(['success' => true, 'message' => 'Agriculturist assessment saved without changing the original AI prediction.', 'data' => new DiagnosisResource($diagnosis)]);
    }
}
