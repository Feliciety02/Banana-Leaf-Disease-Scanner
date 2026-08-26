<?php

namespace App\Http\Controllers;

use App\Contracts\Repositories\DiseaseRepositoryInterface;
use App\Http\Resources\DiseaseResource;
use App\Models\Disease;
use Illuminate\Http\JsonResponse;

class DiseaseController extends Controller
{
    public function __construct(private readonly DiseaseRepositoryInterface $diseases) {}

    public function index(): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'Verified disease information retrieved.', 'data' => DiseaseResource::collection($this->diseases->verified())]);
    }

    public function show(Disease $disease): JsonResponse
    {
        abort_unless($disease->is_verified && $disease->verification_status === 'verified', 404);

        return response()->json(['success' => true, 'message' => 'Verified disease information retrieved.', 'data' => new DiseaseResource($this->diseases->withScientificContent($disease))]);
    }
}
