<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Disease\UpsertDiseaseRequest;
use App\Http\Resources\DiseaseResource;
use App\Models\Disease;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;

class DiseaseController extends Controller
{
    public function store(UpsertDiseaseRequest $request): JsonResponse
    {
        $data = $request->safe()->except('image');
        if ($request->hasFile('image')) {
            $data['image_path'] = $request->file('image')->store('diseases', 'public');
        }
        $disease = Disease::query()->create($data);

        return response()->json(['success' => true, 'message' => 'Disease information created.', 'data' => new DiseaseResource($disease)], 201);
    }

    public function update(UpsertDiseaseRequest $request, Disease $disease): JsonResponse
    {
        $data = $request->safe()->except('image');
        if ($request->hasFile('image')) {
            if ($disease->image_path) {
                Storage::disk('public')->delete($disease->image_path);
            }
            $data['image_path'] = $request->file('image')->store('diseases', 'public');
        }
        $disease->update($data);

        return response()->json(['success' => true, 'message' => 'Disease information updated.', 'data' => new DiseaseResource($disease->fresh())]);
    }

    public function destroy(Disease $disease): JsonResponse
    {
        if ($disease->image_path) {
            Storage::disk('public')->delete($disease->image_path);
        }
        $disease->delete();

        return response()->json(status: 204);
    }
}
