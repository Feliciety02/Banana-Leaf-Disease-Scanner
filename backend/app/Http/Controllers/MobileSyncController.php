<?php

namespace App\Http\Controllers;

use App\Models\Diagnosis;
use App\Models\Disease;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class MobileSyncController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $request->validate(['diagnoses' => ['required', 'array', 'max:100'], 'diagnoses.*' => ['array']]);
        $results = [];

        foreach ($request->input('diagnoses') as $item) {
            $validator = Validator::make($item, [
                'sync_uuid' => ['required', 'uuid'], 'predicted_class' => ['required', 'string', 'max:100', Rule::in(config('banana.class_labels', []))],
                'confidence' => ['required', 'numeric', 'between:0,100'], 'model_version' => ['nullable', 'string', 'max:100'],
                'inference_time_ms' => ['nullable', 'integer', 'min:0'], 'farmer_notes' => ['nullable', 'string', 'max:1000'], 'diagnosed_at' => ['required', 'date'],
                'research_consent' => ['sometimes', 'boolean'],
            ]);
            if ($validator->fails()) {
                $results[] = ['sync_uuid' => $item['sync_uuid'] ?? null, 'status' => 'rejected', 'errors' => $validator->errors()];

                continue;
            }

            $data = $validator->validated();
            $researchConsent = (bool) ($data['research_consent'] ?? false);
            unset($data['research_consent']);
            $existing = Diagnosis::query()->where('sync_uuid', $data['sync_uuid'])->first();
            if ($existing) {
                $results[] = ['sync_uuid' => $data['sync_uuid'], 'status' => $existing->user_id === $request->user()->id ? 'already_synchronized' : 'rejected'];

                continue;
            }

            $disease = Disease::query()->where('slug', $data['predicted_class'])->first();
            Diagnosis::query()->create([
                ...$data,
                'user_id' => $request->user()->id,
                'disease_id' => $disease?->id,
                'source' => 'mobile',
                'is_simulated' => config('banana.ai_mode') !== 'PRODUCTION',
                'sync_status' => 'synced',
                'research_consented_at' => $researchConsent ? now() : null,
                'research_consent_version' => $researchConsent ? config('banana.research_consent_version') : null,
            ]);
            $results[] = ['sync_uuid' => $data['sync_uuid'], 'status' => 'created'];
        }

        return response()->json(['success' => true, 'message' => 'Synchronization processed.', 'data' => ['results' => $results]]);
    }

    public function image(Request $request, string $syncUuid): JsonResponse
    {
        $request->validate(['image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:10240']]);
        $diagnosis = Diagnosis::query()
            ->where('sync_uuid', $syncUuid)
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        if (! $diagnosis->hasActiveResearchConsent()) {
            throw ValidationException::withMessages(['image' => 'Research consent is required before this mobile image can be uploaded.']);
        }

        if ($diagnosis->image_path) {
            return response()->json(['success' => true, 'message' => 'Consented research image already synchronized.', 'data' => ['sync_uuid' => $syncUuid]]);
        }
        $diagnosis->update(['image_path' => $request->file('image')->store('diagnoses', 'public')]);

        return response()->json(['success' => true, 'message' => 'Consented research image synchronized.', 'data' => ['sync_uuid' => $syncUuid]]);
    }
}
