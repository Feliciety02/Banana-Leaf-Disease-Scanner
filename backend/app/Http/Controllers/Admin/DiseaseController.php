<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Disease\UpsertDiseaseRequest;
use App\Http\Resources\DiseaseResource;
use App\Models\Disease;
use App\Models\DiseaseEvidence;
use App\Models\DiseaseManagement;
use App\Models\DiseaseSymptom;
use App\Models\ResearchSource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class DiseaseController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Disease::query()->withCount(['evidence as sources_count' => fn ($query) => $query->select(DB::raw('count(distinct source_id)'))])
            ->orderBy('name');
        $query->when($request->filled('status'), fn ($q) => $q->where('verification_status', $request->string('status')))
            ->when($request->filled('search'), fn ($q) => $q->where(fn ($nested) => $nested->where('name', 'like', '%'.$request->string('search').'%')->orWhere('causal_agent', 'like', '%'.$request->string('search').'%')));

        return response()->json(['success' => true, 'message' => 'Disease knowledge records retrieved.', 'data' => DiseaseResource::collection($query->get())]);
    }

    public function show(Disease $disease): JsonResponse
    {
        $disease->load(['symptomRecords', 'managementRecords.regulatoryChecks.source', 'evidence.source', 'verifier', 'verifications.expert:id,name'])->loadCount(['evidence as sources_count' => fn ($query) => $query->select(DB::raw('count(distinct source_id)'))]);

        return response()->json(['success' => true, 'message' => 'Disease knowledge record retrieved.', 'data' => [
            'disease' => new DiseaseResource($disease),
            'evidence' => $disease->evidence,
            'verified_by' => $disease->verifier?->only(['id', 'name']),
            'regulatory_recheck_required' => $disease->managementRecords->contains(function ($item) {
                if ($item->category === 'chemical') {
                    return ! $item->regulatoryChecks->contains(fn ($check) => $check->registration_status === 'registered' && $check->checked_at->gte(now()->subMonths(config('banana.regulatory_review_months'))) && (! $check->registration_expires_at || $check->registration_expires_at->isFuture()));
                }

                return $item->regulatory_check_required && (! $item->regulatory_checked_at || $item->regulatory_checked_at->lt(now()->subMonths(config('banana.regulatory_review_months'))));
            }),
        ]]);
    }

    public function store(UpsertDiseaseRequest $request): JsonResponse
    {
        $data = $this->contentData($request);
        $data['verification_status'] = 'draft';
        $data['is_verified'] = false;
        $disease = Disease::query()->create($data);

        return response()->json(['success' => true, 'message' => 'Draft disease knowledge record created.', 'data' => new DiseaseResource($disease)], 201);
    }

    public function update(UpsertDiseaseRequest $request, Disease $disease): JsonResponse
    {
        $data = $this->contentData($request, $disease);
        if ($disease->is_verified) {
            $data = [...$data, 'verification_status' => 'researched', 'is_verified' => false, 'verified_at' => null, 'verified_by' => null];
        }
        $disease->update($data);

        return response()->json(['success' => true, 'message' => $disease->wasChanged('is_verified') ? 'Changes saved and returned for re-review.' : 'Disease knowledge record updated.', 'data' => new DiseaseResource($disease->fresh())]);
    }

    public function setStatus(Request $request, Disease $disease): JsonResponse
    {
        $status = $request->validate(['status' => ['required', Rule::in(['draft', 'researched', 'archived'])]])['status'];
        $disease->update(['verification_status' => $status, 'is_verified' => false, 'verified_at' => null, 'verified_by' => null]);

        return response()->json(['success' => true, 'message' => 'Verification status updated.', 'data' => new DiseaseResource($disease->fresh())]);
    }

    public function storeSymptom(Request $request, Disease $disease): JsonResponse
    {
        $data = $request->validate([
            'stage' => ['required', Rule::in(['early', 'typical', 'advanced'])], 'plant_part' => ['required', Rule::in(['leaves', 'pseudostem', 'roots', 'fruit', 'flower', 'suckers'])],
            'symptom' => ['required', 'string'], 'visible_in_leaf_image' => ['required', 'boolean'], 'farmer_friendly_text' => ['nullable', 'string'], 'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);
        $item = $disease->symptomRecords()->create($data);
        $this->invalidate($disease);

        return response()->json(['success' => true, 'message' => 'Symptom added; record requires review.', 'data' => $item], 201);
    }

    public function destroySymptom(Disease $disease, DiseaseSymptom $symptom): JsonResponse
    {
        abort_unless($symptom->disease_id === $disease->id, 404);
        $symptom->delete();
        $this->invalidate($disease);

        return response()->json(status: 204);
    }

    public function storeManagement(Request $request, Disease $disease): JsonResponse
    {
        $data = $request->validate([
            'category' => ['required', Rule::in(['prevention', 'sanitation', 'cultural', 'biological', 'resistant_material', 'chemical', 'containment', 'expert_referral'])],
            'recommendation' => ['required', 'string'], 'farmer_friendly_text' => ['nullable', 'string'], 'evidence_strength' => ['required', Rule::in(['high', 'moderate', 'limited'])],
            'requires_professional' => ['required', 'boolean'], 'regulatory_check_required' => ['required', 'boolean'], 'regulatory_checked_at' => ['nullable', 'date'], 'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);
        if ($data['category'] === 'chemical' && ! $data['regulatory_check_required']) {
            throw ValidationException::withMessages(['regulatory_check_required' => 'Chemical guidance must require a current Philippine regulatory check.']);
        }
        $item = $disease->managementRecords()->create($data);
        $this->invalidate($disease);

        return response()->json(['success' => true, 'message' => 'Management claim added; record requires review.', 'data' => $item], 201);
    }

    public function destroyManagement(Disease $disease, DiseaseManagement $management): JsonResponse
    {
        abort_unless($management->disease_id === $disease->id, 404);
        $management->delete();
        $this->invalidate($disease);

        return response()->json(status: 204);
    }

    public function storeRegulatoryCheck(Request $request, Disease $disease, DiseaseManagement $management): JsonResponse
    {
        abort_unless($management->disease_id === $disease->id && $management->category === 'chemical', 404);
        $data = $request->validate([
            'source_id' => ['required', 'exists:research_sources,id'], 'product_name' => ['required', 'string', 'max:255'],
            'active_ingredient' => ['nullable', 'string', 'max:255'], 'permitted_crop' => ['required', 'string', 'max:255'],
            'permitted_target' => ['required', 'string', 'max:255'], 'registration_number' => ['nullable', 'string', 'max:255'],
            'registration_status' => ['required', Rule::in(['registered', 'restricted', 'banned', 'expired', 'unverified'])],
            'registration_expires_at' => ['nullable', 'date'], 'approved_label_url' => ['nullable', 'url', 'max:2000'],
            'checked_at' => ['required', 'date', 'before_or_equal:now'], 'notes' => ['nullable', 'string'],
        ]);
        $source = ResearchSource::query()->findOrFail($data['source_id']);
        if ($source->source_type !== 'regulatory_document') {
            throw ValidationException::withMessages(['source_id' => 'Pesticide registration checks require an official regulatory-document source.']);
        }
        $check = $management->regulatoryChecks()->create([...$data, 'checked_by' => $request->user()->id]);
        $management->update(['regulatory_check_required' => true, 'regulatory_checked_at' => $check->checked_at]);
        $this->invalidate($disease);

        return response()->json(['success' => true, 'message' => 'Separate Philippine pesticide regulatory evidence recorded; disease content requires review.', 'data' => $check->load('source')], 201);
    }

    public function storeEvidence(Request $request, Disease $disease): JsonResponse
    {
        $data = $request->validate([
            'source_id' => ['required', 'exists:research_sources,id'],
            'claim_type' => ['required', Rule::in(['causal_agent', 'taxonomy', 'symptom', 'transmission', 'prevention', 'management', 'chemical_management', 'curative_status', 'philippine_relevance', 'differential_diagnosis'])],
            'claim_text' => ['required', 'string'], 'evidence_strength' => ['required', Rule::in(['high', 'moderate', 'limited'])], 'notes' => ['nullable', 'string'],
        ]);
        $evidence = $disease->evidence()->create($data);
        $this->invalidate($disease);

        return response()->json(['success' => true, 'message' => 'Claim-level evidence mapped; record requires review.', 'data' => $evidence->load('source')], 201);
    }

    public function destroyEvidence(Disease $disease, DiseaseEvidence $evidence): JsonResponse
    {
        abort_unless($evidence->disease_id === $disease->id, 404);
        $evidence->delete();
        $this->invalidate($disease);

        return response()->json(status: 204);
    }

    public function destroy(Disease $disease): JsonResponse
    {
        $disease->update(['verification_status' => 'archived', 'is_verified' => false, 'verified_at' => null, 'verified_by' => null]);

        return response()->json(['success' => true, 'message' => 'Disease knowledge record archived.']);
    }

    private function contentData(UpsertDiseaseRequest $request, ?Disease $disease = null): array
    {
        $data = $request->safe()->except('image');
        $data['description'] = $data['farmer_summary'] ?? 'Insufficient verified evidence available.';
        $data['symptoms'] = $disease?->symptoms ?? [];
        $data['management'] = $disease?->management ?? 'Insufficient verified evidence available.';
        if ($request->hasFile('image')) {
            if ($disease?->image_path) {
                Storage::disk('public')->delete($disease->image_path);
            }
            $data['image_path'] = $request->file('image')->store('diseases', 'public');
        }

        return $data;
    }

    private function invalidate(Disease $disease): void
    {
        if ($disease->is_verified) {
            $disease->update(['verification_status' => 'researched', 'is_verified' => false, 'verified_at' => null, 'verified_by' => null]);
        }
    }
}
