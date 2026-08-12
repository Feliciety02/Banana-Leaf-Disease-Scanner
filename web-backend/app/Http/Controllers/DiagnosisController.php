<?php

namespace App\Http\Controllers;

use App\Http\Requests\Diagnosis\StoreDiagnosisRequest;
use App\Http\Resources\DiagnosisResource;
use App\Models\Diagnosis;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class DiagnosisController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = $request->user()->diagnoses()->with('disease')->latest('diagnosed_at');
        $query->when($request->filled('predicted_class'), fn ($q) => $q->where('predicted_class', $request->string('predicted_class')))
            ->when($request->filled('date'), fn ($q) => $q->whereDate('diagnosed_at', $request->date('date')))
            ->when($request->filled('confidence_min'), fn ($q) => $q->where('confidence', '>=', $request->float('confidence_min')))
            ->when($request->filled('confidence_max'), fn ($q) => $q->where('confidence', '<=', $request->float('confidence_max')));
        $paginator = $query->paginate(min($request->integer('per_page', 25), 100));

        return $this->paginated($paginator, 'Diagnoses retrieved.');
    }

    public function store(StoreDiagnosisRequest $request): JsonResponse
    {
        $data = $request->safe()->except('image');
        $data['user_id'] = $request->user()->id;
        $data['is_simulated'] = config('banana.ai_mode') !== 'PRODUCTION';
        $data['image_path'] = $request->hasFile('image') ? $request->file('image')->store('diagnoses', 'public') : null;
        $data['sync_status'] = $data['source'] === 'mobile' ? 'synced' : null;
        $diagnosis = Diagnosis::query()->create($data);

        return response()->json(['success' => true, 'message' => 'Diagnosis created.', 'data' => new DiagnosisResource($diagnosis->load('disease'))], 201);
    }

    public function show(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        $this->authorize('view', $diagnosis);

        return response()->json(['success' => true, 'message' => 'Diagnosis retrieved.', 'data' => new DiagnosisResource($diagnosis->load('disease'))]);
    }

    public function destroy(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        $this->authorize('delete', $diagnosis);
        if ($diagnosis->image_path) {
            Storage::disk('public')->delete($diagnosis->image_path);
        }
        if ($diagnosis->gradcam_path) {
            Storage::disk('public')->delete($diagnosis->gradcam_path);
        }
        $diagnosis->delete();

        return response()->json(status: 204);
    }

    private function paginated($paginator, string $message): JsonResponse
    {
        return response()->json(['success' => true, 'message' => $message, 'data' => [
            'items' => DiagnosisResource::collection($paginator->getCollection()),
            'pagination' => ['current_page' => $paginator->currentPage(), 'last_page' => $paginator->lastPage(), 'per_page' => $paginator->perPage(), 'total' => $paginator->total()],
        ]]);
    }
}
