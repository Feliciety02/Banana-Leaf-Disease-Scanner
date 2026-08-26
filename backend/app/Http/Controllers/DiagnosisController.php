<?php

namespace App\Http\Controllers;

use App\Http\Requests\Diagnosis\StoreDiagnosisRequest;
use App\Http\Resources\DiagnosisResource;
use App\Models\Diagnosis;
use App\Services\DiagnosisService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DiagnosisController extends Controller
{
    public function __construct(private readonly DiagnosisService $diagnoses) {}

    public function index(Request $request): JsonResponse
    {
        $filters = [];
        foreach (['predicted_class', 'date', 'confidence_min', 'confidence_max'] as $filter) {
            if ($request->filled($filter)) {
                $filters[$filter] = match ($filter) {
                    'date' => $request->date($filter),
                    'confidence_min', 'confidence_max' => $request->float($filter),
                    default => $request->string($filter)->toString(),
                };
            }
        }
        $paginator = $this->diagnoses->paginateForUser($request->user(), $filters, $request->integer('per_page', 25));

        return $this->paginated($paginator, 'Diagnoses retrieved.');
    }

    public function store(StoreDiagnosisRequest $request): JsonResponse
    {
        $diagnosis = $this->diagnoses->create(
            $request->user(),
            $request->safe()->except(['image', 'research_consent']),
            $request->file('image'),
            $request->boolean('research_consent'),
        );

        return response()->json(['success' => true, 'message' => 'Diagnosis created.', 'data' => new DiagnosisResource($diagnosis)], 201);
    }

    public function show(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        $this->authorize('view', $diagnosis);

        return response()->json(['success' => true, 'message' => 'Diagnosis retrieved.', 'data' => new DiagnosisResource($this->diagnoses->details($diagnosis))]);
    }

    public function requestReview(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        abort_unless($request->user()->isFarmer() && $diagnosis->user_id === $request->user()->id, 403);
        $data = $request->validate(['farmer_notes' => ['nullable', 'string', 'max:1000']]);
        if (! $this->diagnoses->requestReview($diagnosis, $data['farmer_notes'] ?? null, array_key_exists('farmer_notes', $data))) {
            return response()->json(['success' => false, 'message' => 'This diagnosis already has an agricultural reviewer assessment.', 'errors' => (object) []], 422);
        }

        return response()->json(['success' => true, 'message' => 'Review requested. An agricultural reviewer can now assess this saved image.', 'data' => new DiagnosisResource($this->diagnoses->details($diagnosis))]);
    }

    public function destroy(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        $this->authorize('delete', $diagnosis);
        $this->diagnoses->delete($diagnosis);

        return response()->json(status: 204);
    }

    public function withdrawResearchConsent(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        $this->authorize('view', $diagnosis);
        $result = $this->diagnoses->withdrawResearchConsent($diagnosis);
        if ($result === DiagnosisService::CONSENT_INACTIVE) {
            return response()->json(['success' => false, 'message' => 'This diagnosis has no active research consent.', 'errors' => (object) []], 422);
        }
        if ($result === DiagnosisService::CONSENT_DATASET_APPROVED) {
            return response()->json(['success' => false, 'message' => 'This image is already part of an approved research dataset. Contact the research team to request removal.', 'errors' => (object) []], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'Research consent withdrawn. This image can no longer be approved for a research dataset.',
            'data' => new DiagnosisResource($this->diagnoses->details($diagnosis->fresh())),
        ]);
    }

    private function paginated($paginator, string $message): JsonResponse
    {
        return response()->json(['success' => true, 'message' => $message, 'data' => [
            'items' => DiagnosisResource::collection($paginator->getCollection()),
            'pagination' => ['current_page' => $paginator->currentPage(), 'last_page' => $paginator->lastPage(), 'per_page' => $paginator->perPage(), 'total' => $paginator->total()],
        ]]);
    }
}
