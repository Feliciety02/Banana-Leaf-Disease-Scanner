<?php

namespace App\Http\Controllers;

use App\Services\InferenceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InferenceController extends Controller
{
    public function __construct(private readonly InferenceService $inference) {}

    public function __invoke(Request $request): JsonResponse
    {
        $request->validate(['image' => ['required', 'image', 'max:10240']]);

        return response()->json(['data' => $this->inference->predict($request->file('image'))]);
    }
}
