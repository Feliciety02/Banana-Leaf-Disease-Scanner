<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InferenceController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $request->validate(['image' => ['required', 'image', 'max:10240']]);

        // Replace this response with the Python inference-service HTTP call.
        return response()->json(['data' => [
            'diseaseId' => 'development-unconfigured',
            'confidence' => 0,
            'latency' => 0,
            'model' => 'SIMULATED / DEVELOPMENT — labels pending',
            'probabilities' => [],
            'is_simulated' => true,
            'is_uncertain' => true,
            'content_status' => 'DISEASE CONTENT PENDING — final dataset class labels have not yet been established.',
        ]]);
    }
}
