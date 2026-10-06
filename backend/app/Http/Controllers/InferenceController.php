<?php

namespace App\Http\Controllers;

use App\Services\InferenceService;
use App\Services\InferenceReceiptService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InferenceController extends Controller
{
    public function __construct(private readonly InferenceService $inference, private readonly InferenceReceiptService $receipts) {}

    public function __invoke(Request $request): JsonResponse
    {
        $request->validate(['image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:10240', 'dimensions:max_width=5000,max_height=5000']]);

        $result = $this->inference->predict($request->file('image'));
        return response()->json([
            'success' => true,
            'message' => 'Legacy web inference completed.',
            'data' => [...$result, 'inference_receipt' => $this->receipts->issue($request->file('image'), $result)],
        ]);
    }
}
