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
        $request->validate(['image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:10240', 'dimensions:max_width=5000,max_height=5000']]);

        return response()->json([
            'success' => true,
            'message' => 'Legacy web inference completed.',
            'data' => $this->inference->predict($request->file('image')),
        ]);
    }
}
