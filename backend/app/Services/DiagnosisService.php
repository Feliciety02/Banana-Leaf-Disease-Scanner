<?php

namespace App\Services;

use App\Contracts\Repositories\DiagnosisRepositoryInterface;
use App\Models\Diagnosis;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class DiagnosisService
{
    public const CONSENT_WITHDRAWN = 'withdrawn';

    public const CONSENT_INACTIVE = 'inactive';

    public const CONSENT_DATASET_APPROVED = 'dataset_approved';

    public function __construct(private readonly DiagnosisRepositoryInterface $diagnoses) {}

    public function paginateForUser(User $user, array $filters, int $perPage): LengthAwarePaginator
    {
        return $this->diagnoses->paginateForUser($user, $filters, min($perPage, 100));
    }

    public function paginateAll(array $filters, int $perPage): LengthAwarePaginator
    {
        return $this->diagnoses->paginateAll($filters, min($perPage, 100));
    }

    public function create(User $user, array $attributes, ?UploadedFile $image, bool $researchConsent): Diagnosis
    {
        $attributes['user_id'] = $user->id;
        $attributes['is_simulated'] = config('banana.ai_mode') !== 'PRODUCTION';
        $attributes['image_path'] = $image?->store('diagnoses', 'public');
        $attributes['sync_status'] = $attributes['source'] === 'mobile' ? 'synced' : null;

        if ($researchConsent) {
            $attributes['research_consented_at'] = now();
            $attributes['research_consent_version'] = config('banana.research_consent_version');
        }

        return $this->diagnoses->withDetails($this->diagnoses->create($attributes));
    }

    public function details(Diagnosis $diagnosis, bool $includeUser = false): Diagnosis
    {
        return $this->diagnoses->withDetails($diagnosis, $includeUser);
    }

    public function requestReview(Diagnosis $diagnosis, ?string $farmerNotes, bool $notesProvided): bool
    {
        if ($diagnosis->review && $diagnosis->review->review_status !== 'pending') {
            return false;
        }

        $diagnosis->review()->updateOrCreate(
            ['diagnosis_id' => $diagnosis->id],
            ['review_status' => 'pending', 'requested_at' => now()],
        );
        if ($notesProvided) {
            $this->diagnoses->update($diagnosis, ['farmer_notes' => $farmerNotes]);
        }

        return true;
    }

    public function delete(Diagnosis $diagnosis): void
    {
        foreach ([$diagnosis->image_path, $diagnosis->gradcam_path] as $path) {
            if ($path) {
                Storage::disk('public')->delete($path);
            }
        }

        $this->diagnoses->delete($diagnosis);
    }

    public function withdrawResearchConsent(Diagnosis $diagnosis): string
    {
        if (! $diagnosis->hasActiveResearchConsent()) {
            return self::CONSENT_INACTIVE;
        }
        if ($diagnosis->datasetCandidate?->status === 'approved') {
            return self::CONSENT_DATASET_APPROVED;
        }

        $this->diagnoses->update($diagnosis, ['research_consent_withdrawn_at' => now()]);

        return self::CONSENT_WITHDRAWN;
    }
}
