<?php

namespace App\Services;

use App\Contracts\Repositories\DiagnosisRepositoryInterface;
use App\Contracts\Repositories\DiseaseRepositoryInterface;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class MobileSyncService
{
    public function __construct(
        private readonly DiagnosisRepositoryInterface $diagnoses,
        private readonly DiseaseRepositoryInterface $diseases,
    ) {}

    public function process(User $user, array $items): array
    {
        $results = [];

        foreach ($items as $item) {
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
            $existing = $this->diagnoses->findBySyncUuid($data['sync_uuid']);
            if ($existing) {
                $results[] = ['sync_uuid' => $data['sync_uuid'], 'status' => $existing->user_id === $user->id ? 'already_synchronized' : 'rejected'];

                continue;
            }

            $disease = $this->diseases->findBySlug($data['predicted_class']);
            $this->diagnoses->create([
                ...$data,
                'user_id' => $user->id,
                'disease_id' => $disease?->id,
                'source' => 'mobile',
                'is_simulated' => config('banana.ai_mode') !== 'PRODUCTION',
                'sync_status' => 'synced',
                'research_consented_at' => $researchConsent ? now() : null,
                'research_consent_version' => $researchConsent ? config('banana.research_consent_version') : null,
            ]);
            $results[] = ['sync_uuid' => $data['sync_uuid'], 'status' => 'created'];
        }

        return $results;
    }

    public function storeConsentedImage(User $user, string $syncUuid, UploadedFile $image): bool
    {
        $diagnosis = $this->diagnoses->findOwnedBySyncUuid($syncUuid, $user->id);
        if (! $diagnosis->hasActiveResearchConsent()) {
            throw ValidationException::withMessages(['image' => 'Research consent is required before this mobile image can be uploaded.']);
        }
        if ($diagnosis->image_path) {
            return false;
        }

        $this->diagnoses->update($diagnosis, ['image_path' => $image->store('diagnoses', 'public')]);

        return true;
    }
}
