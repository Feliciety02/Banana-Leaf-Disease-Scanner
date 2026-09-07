<?php

namespace App\Http\Controllers;

use App\Http\Resources\DiagnosisResource;
use App\Services\MobileSyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class MobileSyncController extends Controller
{
    public function __construct(private readonly MobileSyncService $mobileSync) {}

    public function __invoke(Request $request): JsonResponse
    {
        $request->validate([
            'diagnoses' => ['sometimes', 'array', 'max:100'],
            'diagnoses.*' => ['array'],
            'deletions' => ['sometimes', 'array', 'max:100'],
            'deletions.*' => ['array'],
        ]);
        $diagnoses = $request->input('diagnoses', []);
        $deletions = $request->input('deletions', []);
        if (! $diagnoses && ! $deletions) {
            throw ValidationException::withMessages(['diagnoses' => 'At least one diagnosis or deletion is required.']);
        }

        $results = $this->mobileSync->process($request->user(), $diagnoses);
        $deletionResults = $this->mobileSync->processDeletions($request->user(), $deletions);
        Log::info('Offline synchronization processed.', [
            'user_id' => $request->user()->id,
            'request_id' => $request->attributes->get('request_id'),
            'diagnoses' => count($diagnoses),
            'deletions' => count($deletions),
            'accepted' => collect($results)->whereIn('status', ['created', 'already_synchronized'])->count(),
            'deleted' => collect($deletionResults)->whereIn('status', ['deleted', 'already_deleted'])->count(),
            'rejected' => collect([...$results, ...$deletionResults])->where('status', 'rejected')->count(),
        ]);

        return response()->json(['success' => true, 'message' => 'Synchronization processed.', 'data' => [
            'results' => $results,
            'deletion_results' => $deletionResults,
            'server_time' => now()->toIso8601String(),
        ]]);
    }

    public function pull(Request $request): JsonResponse
    {
        $data = $request->validate([
            'cursor' => ['nullable', 'string', 'max:2048'],
            'limit' => ['nullable', 'integer', 'between:1,100'],
        ]);
        $page = $this->mobileSync->changes($request->user(), $data['cursor'] ?? null, $data['limit'] ?? 100);
        $changes = $page['records']->map(function ($change) use ($request) {
            $diagnosis = $change->diagnosis;
            if ($change->change_type === 'delete' || ! $diagnosis || $diagnosis->trashed()) {
                return [
                    'type' => 'delete',
                    'server_id' => $change->diagnosis_id,
                    'sync_uuid' => $change->sync_uuid,
                    'deleted_at' => $diagnosis?->deleted_at?->toIso8601String(),
                ];
            }

            return [
                'type' => 'upsert',
                'diagnosis' => (new DiagnosisResource($diagnosis))->resolve($request),
            ];
        })->all();

        return response()->json(['success' => true, 'message' => 'Synchronization changes retrieved.', 'data' => [
            'changes' => $changes,
            'next_cursor' => $page['next_cursor'],
            'has_more' => $page['has_more'],
            'server_time' => now()->toIso8601String(),
        ]]);
    }

    public function image(Request $request, string $syncUuid): JsonResponse
    {
        $request->validate([
            'image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:10240', 'dimensions:max_width=5000,max_height=5000'],
            'purpose' => ['sometimes', Rule::in(['research', 'review'])],
        ]);
        $stored = $this->mobileSync->storeConsentedImage(
            $request->user(),
            $syncUuid,
            $request->file('image'),
            $request->string('purpose')->value() ?: 'research',
        );
        if (! $stored) {
            return response()->json(['success' => true, 'message' => 'Queued image already synchronized.', 'data' => ['sync_uuid' => $syncUuid]]);
        }

        return response()->json(['success' => true, 'message' => 'Queued image synchronized.', 'data' => ['sync_uuid' => $syncUuid]]);
    }
}
