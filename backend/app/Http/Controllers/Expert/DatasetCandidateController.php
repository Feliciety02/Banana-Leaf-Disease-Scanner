<?php

namespace App\Http\Controllers\Expert;

use App\Http\Controllers\Controller;
use App\Http\Resources\DatasetCandidateResource;
use App\Models\DatasetCandidate;
use App\Models\Diagnosis;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class DatasetCandidateController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = DatasetCandidate::query()->with(['diagnosis.user', 'diagnosis.disease', 'diagnosis.review.expert', 'proposer:id,name', 'reviewer:id,name'])->latest();
        $query->when($request->filled('status'), fn ($items) => $items->where('status', $request->string('status')));

        return response()->json(['success' => true, 'message' => 'Research dataset candidates retrieved.', 'data' => DatasetCandidateResource::collection($query->get())]);
    }

    public function store(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        $diagnosis->load('review');
        if (! $diagnosis->image_path) {
            throw ValidationException::withMessages(['diagnosis' => 'Only diagnoses with a retained image can become research candidates.']);
        }
        if (! $diagnosis->hasActiveResearchConsent()) {
            throw ValidationException::withMessages(['diagnosis' => 'The farmer must give active research-image consent before this image can be nominated.']);
        }
        if (! $diagnosis->review || $diagnosis->review->review_status === 'pending') {
            throw ValidationException::withMessages(['diagnosis' => 'Complete the agricultural review before nominating this image.']);
        }

        $candidate = DatasetCandidate::query()->firstOrCreate(
            ['diagnosis_id' => $diagnosis->id],
            ['proposed_by' => $request->user()->id, 'status' => 'pending'],
        );

        return response()->json(['success' => true, 'message' => 'Image nominated for manual research-dataset review. It has not been added to training data.', 'data' => new DatasetCandidateResource($candidate->load(['diagnosis.user', 'diagnosis.disease', 'diagnosis.review.expert', 'proposer:id,name', 'reviewer:id,name']))], 201);
    }

    public function update(Request $request, DatasetCandidate $candidate): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(['approved', 'rejected', 'uncertain'])],
            'review_notes' => ['nullable', 'string', 'max:5000'],
        ]);
        $candidate->load('diagnosis');
        if ($data['status'] === 'approved' && ! $candidate->diagnosis->hasActiveResearchConsent()) {
            throw ValidationException::withMessages(['status' => 'This candidate cannot be approved because research consent is missing or was withdrawn.']);
        }
        $candidate->update([...$data, 'reviewed_by' => $request->user()->id, 'reviewed_at' => now()]);

        return response()->json(['success' => true, 'message' => 'Manual dataset-candidate decision recorded.', 'data' => new DatasetCandidateResource($candidate->load(['diagnosis.user', 'diagnosis.disease', 'diagnosis.review.expert', 'proposer:id,name', 'reviewer:id,name']))]);
    }
}
