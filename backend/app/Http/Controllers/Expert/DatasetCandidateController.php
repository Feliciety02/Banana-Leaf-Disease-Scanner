<?php

namespace App\Http\Controllers\Expert;

use App\Contracts\Repositories\DatasetCandidateRepositoryInterface;
use App\Http\Controllers\Controller;
use App\Http\Resources\DatasetCandidateResource;
use App\Models\DatasetCandidate;
use App\Models\Diagnosis;
use App\Services\DatasetCandidateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DatasetCandidateController extends Controller
{
    public function __construct(
        private readonly DatasetCandidateRepositoryInterface $candidates,
        private readonly DatasetCandidateService $candidateService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $status = $request->filled('status') ? $request->string('status')->toString() : null;

        return response()->json(['success' => true, 'message' => 'Research dataset candidates retrieved.', 'data' => DatasetCandidateResource::collection($this->candidates->all($status))]);
    }

    public function store(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        $candidate = $this->candidateService->nominate($request->user(), $diagnosis);

        return response()->json(['success' => true, 'message' => 'Image nominated for manual research-dataset review. It has not been added to training data.', 'data' => new DatasetCandidateResource($candidate)], 201);
    }

    public function update(Request $request, DatasetCandidate $candidate): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(['approved', 'rejected', 'uncertain'])],
            'review_notes' => ['nullable', 'string', 'max:5000'],
        ]);
        $candidate = $this->candidateService->decide($request->user(), $candidate, $data);

        return response()->json(['success' => true, 'message' => 'Manual dataset-candidate decision recorded.', 'data' => new DatasetCandidateResource($candidate)]);
    }
}
