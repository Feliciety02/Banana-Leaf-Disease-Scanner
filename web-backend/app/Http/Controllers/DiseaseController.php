<?php

namespace App\Http\Controllers;

use App\Http\Resources\DiseaseResource;
use App\Models\Disease;
use Illuminate\Http\JsonResponse;

class DiseaseController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'Disease information retrieved.', 'data' => DiseaseResource::collection(Disease::query()->orderBy('id')->get())]);
    }

    public function show(Disease $disease): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'Disease information retrieved.', 'data' => new DiseaseResource($disease)]);
    }
}
