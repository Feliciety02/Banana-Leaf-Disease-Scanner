<?php

namespace App\Http\Controllers\Expert;

use App\Http\Controllers\Controller;
use App\Http\Resources\DiagnosisResource;
use App\Models\Diagnosis;
use App\Services\ExpertReviewService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DiagnosisReviewController extends Controller
{
    public function __construct(private readonly ExpertReviewService $reviews) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'Diagnosis review cases retrieved.', 'data' => DiagnosisResource::collection(
            $this->reviews->cases($request->string('scope', 'pending')->toString())
        )]);
    }

    public function show(Diagnosis $diagnosis): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'Diagnosis review case retrieved.', 'data' => new DiagnosisResource($this->reviews->details($diagnosis))]);
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

        $diagnosis = $this->reviews->save($request->user(), $diagnosis, $data);

        return response()->json(['success' => true, 'message' => 'Agricultural reviewer assessment saved without changing the original AI prediction.', 'data' => new DiagnosisResource($diagnosis)]);
    }
}
