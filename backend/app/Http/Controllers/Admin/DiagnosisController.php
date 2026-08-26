<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
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
        foreach (['user', 'class', 'date_from', 'date_to', 'source', 'confidence_min', 'confidence_max'] as $filter) {
            if ($request->filled($filter)) {
                $key = ['user' => 'user_id', 'class' => 'predicted_class'][$filter] ?? $filter;
                $filters[$key] = match ($filter) {
                    'user' => $request->integer($filter),
                    'date_from', 'date_to' => $request->date($filter),
                    'confidence_min', 'confidence_max' => $request->float($filter),
                    default => $request->string($filter)->toString(),
                };
            }
        }
        $paginator = $this->diagnoses->paginateAll($filters, $request->integer('per_page', 25));

        return response()->json(['success' => true, 'message' => 'System diagnoses retrieved.', 'data' => ['items' => DiagnosisResource::collection($paginator->getCollection()), 'pagination' => ['current_page' => $paginator->currentPage(), 'last_page' => $paginator->lastPage(), 'per_page' => $paginator->perPage(), 'total' => $paginator->total()]]]);
    }

    public function show(Diagnosis $diagnosis): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'Diagnosis retrieved.', 'data' => new DiagnosisResource($this->diagnoses->details($diagnosis, true))]);
    }

    public function destroy(Diagnosis $diagnosis): JsonResponse
    {
        $this->diagnoses->delete($diagnosis);

        return response()->json(status: 204);
    }
}
