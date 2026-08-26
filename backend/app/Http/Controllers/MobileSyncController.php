<?php

namespace App\Http\Controllers;

use App\Services\MobileSyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MobileSyncController extends Controller
{
    public function __construct(private readonly MobileSyncService $mobileSync) {}

    public function __invoke(Request $request): JsonResponse
    {
        $request->validate(['diagnoses' => ['required', 'array', 'max:100'], 'diagnoses.*' => ['array']]);
        $results = $this->mobileSync->process($request->user(), $request->input('diagnoses'));

        return response()->json(['success' => true, 'message' => 'Synchronization processed.', 'data' => ['results' => $results]]);
    }

    public function image(Request $request, string $syncUuid): JsonResponse
    {
        $request->validate(['image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:10240']]);
        $stored = $this->mobileSync->storeConsentedImage($request->user(), $syncUuid, $request->file('image'));
        if (! $stored) {
            return response()->json(['success' => true, 'message' => 'Consented research image already synchronized.', 'data' => ['sync_uuid' => $syncUuid]]);
        }

        return response()->json(['success' => true, 'message' => 'Consented research image synchronized.', 'data' => ['sync_uuid' => $syncUuid]]);
    }
}
