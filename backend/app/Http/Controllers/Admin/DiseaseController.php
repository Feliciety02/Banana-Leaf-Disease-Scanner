<?php

namespace App\Http\Controllers\Admin;

use App\Contracts\Repositories\DiseaseRepositoryInterface;
use App\Http\Controllers\Controller;
use App\Http\Requests\Disease\UpsertDiseaseRequest;
use App\Http\Resources\DiseaseResource;
use App\Models\Disease;
use App\Models\DiseaseEvidence;
use App\Models\DiseaseManagement;
use App\Models\DiseaseSymptom;
use App\Services\DiseaseKnowledgeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DiseaseController extends Controller
{
    public function __construct(
        private readonly DiseaseRepositoryInterface $diseases,
        private readonly DiseaseKnowledgeService $knowledge,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $filters = [];
        foreach (['status', 'search'] as $filter) {
            if ($request->filled($filter)) {
                $filters[$filter] = $request->string($filter)->toString();
            }
        }

        return response()->json(['success' => true, 'message' => 'Disease knowledge records retrieved.', 'data' => DiseaseResource::collection($this->diseases->forAdministration($filters))]);
    }

    public function show(Disease $disease): JsonResponse
    {
        $details = $this->knowledge->administrationDetails($disease);
        $disease = $details['disease'];

        return response()->json(['success' => true, 'message' => 'Disease knowledge record retrieved.', 'data' => [
            'disease' => new DiseaseResource($disease),
            'evidence' => $disease->evidence,
            'verified_by' => $disease->verifier?->only(['id', 'name']),
            'regulatory_recheck_required' => $details['regulatory_recheck_required'],
        ]]);
    }

    public function store(UpsertDiseaseRequest $request): JsonResponse
    {
        $disease = $this->knowledge->create($request->safe()->except('image'), $request->file('image'));

        return response()->json(['success' => true, 'message' => 'Draft disease knowledge record created.', 'data' => new DiseaseResource($disease)], 201);
    }

    public function update(UpsertDiseaseRequest $request, Disease $disease): JsonResponse
    {
        $result = $this->knowledge->update($disease, $request->safe()->except('image'), $request->file('image'));

        return response()->json(['success' => true, 'message' => $result['returned_for_review'] ? 'Changes saved and returned for re-review.' : 'Disease knowledge record updated.', 'data' => new DiseaseResource($result['disease'])]);
    }

    public function setStatus(Request $request, Disease $disease): JsonResponse
    {
        $status = $request->validate(['status' => ['required', Rule::in(['draft', 'researched', 'archived'])]])['status'];
        $disease = $this->knowledge->setStatus($disease, $status);

        return response()->json(['success' => true, 'message' => 'Verification status updated.', 'data' => new DiseaseResource($disease)]);
    }

    public function storeSymptom(Request $request, Disease $disease): JsonResponse
    {
        $data = $request->validate([
            'stage' => ['required', Rule::in(['early', 'typical', 'advanced'])], 'plant_part' => ['required', Rule::in(['leaves', 'pseudostem', 'roots', 'fruit', 'flower', 'suckers'])],
            'symptom' => ['required', 'string'], 'visible_in_leaf_image' => ['required', 'boolean'], 'farmer_friendly_text' => ['nullable', 'string'], 'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);
        $item = $this->knowledge->addSymptom($disease, $data);

        return response()->json(['success' => true, 'message' => 'Symptom added; record requires review.', 'data' => $item], 201);
    }

    public function destroySymptom(Disease $disease, DiseaseSymptom $symptom): JsonResponse
    {
        $this->knowledge->deleteSymptom($disease, $symptom);

        return response()->json(status: 204);
    }

    public function storeManagement(Request $request, Disease $disease): JsonResponse
    {
        $data = $request->validate([
            'category' => ['required', Rule::in(['prevention', 'sanitation', 'cultural', 'biological', 'resistant_material', 'chemical', 'containment', 'expert_referral'])],
            'recommendation' => ['required', 'string'], 'farmer_friendly_text' => ['nullable', 'string'], 'evidence_strength' => ['required', Rule::in(['high', 'moderate', 'limited'])],
            'requires_professional' => ['required', 'boolean'], 'regulatory_check_required' => ['required', 'boolean'], 'regulatory_checked_at' => ['nullable', 'date'], 'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);
        $item = $this->knowledge->addManagement($disease, $data);

        return response()->json(['success' => true, 'message' => 'Management claim added; record requires review.', 'data' => $item], 201);
    }

    public function destroyManagement(Disease $disease, DiseaseManagement $management): JsonResponse
    {
        $this->knowledge->deleteManagement($disease, $management);

        return response()->json(status: 204);
    }

    public function storeRegulatoryCheck(Request $request, Disease $disease, DiseaseManagement $management): JsonResponse
    {
        $data = $request->validate([
            'source_id' => ['required', 'exists:research_sources,id'], 'product_name' => ['required', 'string', 'max:255'],
            'active_ingredient' => ['nullable', 'string', 'max:255'], 'permitted_crop' => ['required', 'string', 'max:255'],
            'permitted_target' => ['required', 'string', 'max:255'], 'registration_number' => ['nullable', 'string', 'max:255'],
            'registration_status' => ['required', Rule::in(['registered', 'restricted', 'banned', 'expired', 'unverified'])],
            'registration_expires_at' => ['nullable', 'date'], 'approved_label_url' => ['nullable', 'url', 'max:2000'],
            'checked_at' => ['required', 'date', 'before_or_equal:now'], 'notes' => ['nullable', 'string'],
        ]);
        $check = $this->knowledge->addRegulatoryCheck($request->user(), $disease, $management, $data);

        return response()->json(['success' => true, 'message' => 'Separate Philippine pesticide regulatory evidence recorded; disease content requires review.', 'data' => $check], 201);
    }

    public function storeEvidence(Request $request, Disease $disease): JsonResponse
    {
        $data = $request->validate([
            'source_id' => ['required', 'exists:research_sources,id'],
            'claim_type' => ['required', Rule::in(['causal_agent', 'taxonomy', 'symptom', 'transmission', 'prevention', 'management', 'chemical_management', 'curative_status', 'philippine_relevance', 'differential_diagnosis'])],
            'claim_text' => ['required', 'string'], 'evidence_strength' => ['required', Rule::in(['high', 'moderate', 'limited'])], 'notes' => ['nullable', 'string'],
        ]);
        $evidence = $this->knowledge->addEvidence($disease, $data);

        return response()->json(['success' => true, 'message' => 'Claim-level evidence mapped; record requires review.', 'data' => $evidence], 201);
    }

    public function destroyEvidence(Disease $disease, DiseaseEvidence $evidence): JsonResponse
    {
        $this->knowledge->deleteEvidence($disease, $evidence);

        return response()->json(status: 204);
    }

    public function destroy(Disease $disease): JsonResponse
    {
        $this->knowledge->archive($disease);

        return response()->json(['success' => true, 'message' => 'Disease knowledge record archived.']);
    }
}
