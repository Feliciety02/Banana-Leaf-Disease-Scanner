<?php

namespace App\Http\Controllers;

use App\Http\Requests\Diagnosis\StoreDiagnosisRequest;
use App\Http\Resources\DiagnosisResource;
use App\Models\Diagnosis;
use App\Services\DiagnosisService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

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
        // The agriculturist assesses the leaf from its photo, so it must be saved first.
        if (! $diagnosis->image_path) {
            throw ValidationException::withMessages(['image' => 'Send the scan photo first. An agriculturist needs the photo to check this leaf.']);
        }
        if (! $this->diagnoses->requestReview($diagnosis, $data['farmer_notes'] ?? null, array_key_exists('farmer_notes', $data))) {
            return response()->json(['success' => false, 'message' => 'This diagnosis already has an agriculturist assessment.', 'errors' => (object) []], 422);
        }

        return response()->json(['success' => true, 'message' => 'Review requested. An agriculturist can now assess this saved image.', 'data' => new DiagnosisResource($this->diagnoses->details($diagnosis->fresh()))]);
    }

    public function followUp(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        abort_unless($diagnosis->user_id === $request->user()->id, 403);
        $data = $request->validate([
            'farmer_reply' => ['required', 'string', 'max:1000'],
            'image' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:10240', 'dimensions:max_width=5000,max_height=5000'],
        ]);
        $diagnosis = $this->diagnoses->followUp($diagnosis, trim($data['farmer_reply']), $request->file('image'));

        return response()->json(['success' => true, 'message' => 'Reply sent. The case is back with an agriculturist.', 'data' => new DiagnosisResource($diagnosis)]);
    }

    public function setLocation(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        abort_unless($diagnosis->user_id === $request->user()->id, 403);
        $data = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
        ]);

        return response()->json(['success' => true, 'message' => 'Location added to this scan.', 'data' => new DiagnosisResource(
            $this->diagnoses->setLocation($diagnosis, (float) $data['latitude'], (float) $data['longitude'])
        )]);
    }

    public function removeLocation(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        abort_unless($diagnosis->user_id === $request->user()->id, 403);

        return response()->json(['success' => true, 'message' => 'Location removed from this scan.', 'data' => new DiagnosisResource(
            $this->diagnoses->setLocation($diagnosis, null, null)
        )]);
    }

    public function markReviewSeen(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        abort_unless($diagnosis->user_id === $request->user()->id, 403);
        $data = $request->validate(['expected_review_version' => ['sometimes', 'integer', 'min:0']]);
        $this->diagnoses->markReviewSeen($diagnosis, $data['expected_review_version'] ?? 0);

        return response()->json(['success' => true, 'message' => 'Review marked as seen.', 'data' => new DiagnosisResource($this->diagnoses->details($diagnosis->fresh()))]);
    }

    public function destroy(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        $this->authorize('delete', $diagnosis);
        $this->diagnoses->delete($diagnosis);

        return response()->json(status: 204);
    }

    public function grantResearchConsent(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        abort_unless($diagnosis->user_id === $request->user()->id, 403);
        $diagnosis = $this->diagnoses->grantResearchConsent($diagnosis);

        return response()->json([
            'success' => true,
            'message' => 'Research consent recorded. The scan image can now be shared for research review.',
            'data' => new DiagnosisResource($this->diagnoses->details($diagnosis)),
        ]);
    }

    public function withdrawResearchConsent(Request $request, Diagnosis $diagnosis): JsonResponse
    {
        abort_unless($diagnosis->user_id === $request->user()->id, 403);
        $result = $this->diagnoses->withdrawResearchConsent($diagnosis);
        if ($result === DiagnosisService::CONSENT_INACTIVE) {
            return response()->json(['success' => false, 'message' => 'This diagnosis has no active research consent.', 'errors' => (object) []], 422);
        }
        return response()->json([
            'success' => true,
            'message' => 'Research consent withdrawn. Any approved private research copy has been revoked.',
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
