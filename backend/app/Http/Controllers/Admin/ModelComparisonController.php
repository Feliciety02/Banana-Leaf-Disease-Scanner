<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\ModelComparisonService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ModelComparisonController extends Controller
{
    public function __construct(private readonly ModelComparisonService $comparisons) {}

    public function __invoke(Request $request): JsonResponse
    {
        $request->validate(['image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:10240']]);
        $result = $this->comparisons->compare($request->file('image'));

        return response()->json($result['body'], $result['status']);
    }
}
