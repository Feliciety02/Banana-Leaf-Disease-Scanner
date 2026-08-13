<?php

namespace App\Http\Controllers;

use App\Http\Resources\DiseaseResource;
use App\Models\Disease;
use Illuminate\Http\JsonResponse;

class DiseaseController extends Controller
{
    public function index(): JsonResponse
    {
        $diseases = Disease::query()->where('verification_status', 'verified')->where('is_verified', true)
            ->with(['symptomRecords', 'managementRecords.regulatoryChecks', 'evidence.source'])->orderBy('id')->get();

        return response()->json(['success' => true, 'message' => 'Verified disease information retrieved.', 'data' => DiseaseResource::collection($diseases)]);
    }

    public function show(Disease $disease): JsonResponse
    {
        abort_unless($disease->is_verified && $disease->verification_status === 'verified', 404);

        return response()->json(['success' => true, 'message' => 'Verified disease information retrieved.', 'data' => new DiseaseResource($disease->load(['symptomRecords', 'managementRecords.regulatoryChecks', 'evidence.source']))]);
    }
}
