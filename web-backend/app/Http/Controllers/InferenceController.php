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
            'diseaseId' => 'black-sigatoka',
            'confidence' => 94.2,
            'latency' => 84,
            'model' => 'EMV3-INT8 web demo',
            'probabilities' => [
                ['label' => 'Black Sigatoka', 'value' => 94.2],
                ['label' => 'Yellow Sigatoka', 'value' => 3.1],
                ['label' => 'Healthy', 'value' => 1.4],
                ['label' => 'Fusarium Wilt', 'value' => 0.8],
                ['label' => 'Bunchy Top', 'value' => 0.5],
            ],
        ]]);
    }
}
