<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\DiagnosisResource;
use App\Models\Diagnosis;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class DiagnosisController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Diagnosis::query()->with(['user', 'disease'])->latest('diagnosed_at');
        $query->when($request->filled('user'), fn ($q) => $q->where('user_id', $request->integer('user')))
            ->when($request->filled('class'), fn ($q) => $q->where('predicted_class', $request->string('class')))
            ->when($request->filled('date_from'), fn ($q) => $q->whereDate('diagnosed_at', '>=', $request->date('date_from')))
            ->when($request->filled('date_to'), fn ($q) => $q->whereDate('diagnosed_at', '<=', $request->date('date_to')))
            ->when($request->filled('source'), fn ($q) => $q->where('source', $request->string('source')))
            ->when($request->filled('confidence_min'), fn ($q) => $q->where('confidence', '>=', $request->float('confidence_min')))
            ->when($request->filled('confidence_max'), fn ($q) => $q->where('confidence', '<=', $request->float('confidence_max')));
        $paginator = $query->paginate(min($request->integer('per_page', 25), 100));

        return response()->json(['success' => true, 'message' => 'System diagnoses retrieved.', 'data' => ['items' => DiagnosisResource::collection($paginator->getCollection()), 'pagination' => ['current_page' => $paginator->currentPage(), 'last_page' => $paginator->lastPage(), 'per_page' => $paginator->perPage(), 'total' => $paginator->total()]]]);
    }

    public function show(Diagnosis $diagnosis): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'Diagnosis retrieved.', 'data' => new DiagnosisResource($diagnosis->load(['user', 'disease']))]);
    }

    public function destroy(Diagnosis $diagnosis): JsonResponse
    {
        if ($diagnosis->image_path) {
            Storage::disk('public')->delete($diagnosis->image_path);
        }
        if ($diagnosis->gradcam_path) {
            Storage::disk('public')->delete($diagnosis->gradcam_path);
        }
        $diagnosis->delete();

        return response()->json(status: 204);
    }
}
