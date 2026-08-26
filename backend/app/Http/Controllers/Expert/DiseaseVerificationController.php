<?php

namespace App\Http\Controllers\Expert;

use App\Http\Controllers\Admin\DiseaseController as AdminDiseaseController;
use App\Http\Controllers\Controller;
use App\Http\Resources\DiseaseResource;
use App\Models\Disease;
use App\Services\DiseaseVerificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DiseaseVerificationController extends Controller
{
    public function __construct(private readonly DiseaseVerificationService $verificationService) {}

    public function index(Request $request): JsonResponse
    {
        $status = $request->filled('status') ? $request->string('status')->toString() : null;

        return response()->json(['success' => true, 'message' => 'Disease records for expert review retrieved.', 'data' => DiseaseResource::collection($this->verificationService->records($status))]);
    }

    public function show(Disease $disease, AdminDiseaseController $controller): JsonResponse
    {
        return $controller->show($disease);
    }

    public function store(Request $request, Disease $disease): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(['verified', 'revision_required', 'rejected'])],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $result = $this->verificationService->recordReview($request->user(), $disease, $data);

        return response()->json(['success' => true, 'message' => 'Agricultural content review recorded.', 'data' => ['verification' => $result['verification'], 'disease' => new DiseaseResource($result['disease'])]], 201);
    }
}
