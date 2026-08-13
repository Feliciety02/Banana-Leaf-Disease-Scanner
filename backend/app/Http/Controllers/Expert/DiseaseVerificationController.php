<?php

namespace App\Http\Controllers\Expert;

use App\Http\Controllers\Admin\DiseaseController as AdminDiseaseController;
use App\Http\Controllers\Controller;
use App\Http\Resources\DiseaseResource;
use App\Models\Disease;
use App\Services\DiseaseVerificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DiseaseVerificationController extends Controller
{
    public function __construct(private readonly DiseaseVerificationService $verificationService) {}

    public function index(Request $request): JsonResponse
    {
        $query = Disease::query()->withCount(['evidence as sources_count' => fn ($query) => $query->select(DB::raw('count(distinct source_id)'))])
            ->with(['verifications.expert:id,name'])->orderBy('name');
        $query->when($request->filled('status'), fn ($q) => $q->where('verification_status', $request->string('status')));

        return response()->json(['success' => true, 'message' => 'Disease records for expert review retrieved.', 'data' => DiseaseResource::collection($query->get())]);
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

        if ($data['status'] === 'verified') {
            $this->verificationService->assertVerifiable($disease);
        }

        $verification = DB::transaction(function () use ($request, $disease, $data) {
            $verification = $disease->verifications()->create([
                ...$data,
                'expert_id' => $request->user()->id,
                'verified_at' => $data['status'] === 'verified' ? now() : null,
            ]);
            $disease->update($data['status'] === 'verified' ? [
                'verification_status' => 'verified', 'is_verified' => true, 'verified_at' => now(),
                'verified_by' => $request->user()->id, 'last_reviewed_at' => now(),
            ] : [
                'verification_status' => $data['status'] === 'rejected' ? 'draft' : 'researched',
                'is_verified' => false, 'verified_at' => null, 'verified_by' => null, 'last_reviewed_at' => now(),
            ]);

            return $verification;
        });

        return response()->json(['success' => true, 'message' => 'Agricultural content review recorded.', 'data' => ['verification' => $verification->load('expert:id,name'), 'disease' => new DiseaseResource($disease->fresh())]], 201);
    }
}
