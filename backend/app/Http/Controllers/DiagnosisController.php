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
        $query = $request->user()->diagnoses()->with(['disease', 'review.expert'])->latest('diagnosed_at');
        $query->when($request->filled('predicted_class'), fn ($q) => $q->where('predicted_class', $request->string('predicted_class')))
            ->when($request->filled('date'), fn ($q) => $q->whereDate('diagnosed_at', $request->date('date')))
            ->when($request->filled('confidence_min'), fn ($q) => $q->where('confidence', '>=', $request->float('confidence_min')))
            ->when($request->filled('confidence_max'), fn ($q) => $q->where('confidence', '<=', $request->float('confidence_max')));
        $paginator = $query->paginate(min($request->integer('per_page', 25), 100));

        return $this->paginated($paginator, 'Diagnoses retrieved.');
    }

    public function store(StoreDiagnosisRequest $request): JsonResponse
    {
        $data = $request->safe()->except(['image', 'research_consent']);
        $data['user_id'] = $request->user()->id;
        $data['is_simulated'] = config('banana.ai_mode') !== 'PRODUCTION';
        $data['image_path'] = $request->hasFile('image') ? $request->file('image')->store('diagnoses', 'public') : null;
        $data['sync_status'] = $data['source'] === 'mobile' ? 'synced' : null;
        if ($request->boolean('research_consent')) {
            $data['research_consented_at'] = now();
            $data['research_consent_version'] = config('banana.research_consent_version');
        }
        $diagnosis = Diagnosis::query()->create($data);

        return response()->json(['success' => true, 'message' => 'Diagnosis created.', 'data' => new DiagnosisResource($diagnosis->load(['disease', 'review.expert']))], 201);
    }

    public function show(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        $this->authorize('view', $diagnosis);

        return response()->json(['success' => true, 'message' => 'Diagnosis retrieved.', 'data' => new DiagnosisResource($diagnosis->load(['disease', 'review.expert']))]);
    }

    public function requestReview(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        abort_unless($request->user()->isFarmer() && $diagnosis->user_id === $request->user()->id, 403);
        $data = $request->validate(['farmer_notes' => ['nullable', 'string', 'max:1000']]);
        if ($diagnosis->review && $diagnosis->review->review_status !== 'pending') {
            return response()->json(['success' => false, 'message' => 'This diagnosis already has an agricultural reviewer assessment.', 'errors' => (object) []], 422);
        }

        $diagnosis->review()->updateOrCreate(
            ['diagnosis_id' => $diagnosis->id],
            ['review_status' => 'pending', 'requested_at' => now()],
        );
        if (array_key_exists('farmer_notes', $data)) {
            $diagnosis->update(['farmer_notes' => $data['farmer_notes']]);
        }

        return response()->json(['success' => true, 'message' => 'Review requested. An agricultural reviewer can now assess this saved image.', 'data' => new DiagnosisResource($diagnosis->load(['disease', 'review.expert']))]);
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

    public function withdrawResearchConsent(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        $this->authorize('view', $diagnosis);
        if (! $diagnosis->hasActiveResearchConsent()) {
            return response()->json(['success' => false, 'message' => 'This diagnosis has no active research consent.', 'errors' => (object) []], 422);
        }
        if ($diagnosis->datasetCandidate?->status === 'approved') {
            return response()->json(['success' => false, 'message' => 'This image is already part of an approved research dataset. Contact the research team to request removal.', 'errors' => (object) []], 422);
        }

        $diagnosis->update(['research_consent_withdrawn_at' => now()]);

        return response()->json([
            'success' => true,
            'message' => 'Research consent withdrawn. This image can no longer be approved for a research dataset.',
            'data' => new DiagnosisResource($diagnosis->fresh()->load(['disease', 'review.expert'])),
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
