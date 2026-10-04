<?php

namespace App\Services;

use App\Contracts\Repositories\DiagnosisRepositoryInterface;
use App\Contracts\Repositories\DiseaseRepositoryInterface;
use App\Models\Diagnosis;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class DiagnosisService
{
    public const CONSENT_WITHDRAWN = 'withdrawn';

    public const CONSENT_INACTIVE = 'inactive';

    public const CONSENT_DATASET_APPROVED = 'dataset_approved';

    public function __construct(
        private readonly DiagnosisRepositoryInterface $diagnoses,
        private readonly DiseaseRepositoryInterface $diseases,
        private readonly PrivateDiagnosisImageStorage $images,
    ) {}

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
        // The disease link always follows the model's class key so that web,
        // mobile and API records resolve to the same knowledge record.
        $attributes['disease_id'] = $this->diseases->findByModelClassKey($attributes['predicted_class'])?->id;
        $attributes['is_simulated'] = Diagnosis::isSimulatedFor(
            $attributes['source'] ?? 'web',
            isset($attributes['is_simulated']) ? (bool) $attributes['is_simulated'] : null,
        );
        $attributes['image_path'] = $image ? $this->images->store($image) : null;
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

    /** Attaches or removes the farmer-chosen location of a scan, rounded to about 110 m. */
    public function setLocation(Diagnosis $diagnosis, ?float $latitude, ?float $longitude): Diagnosis
    {
        $this->diagnoses->update($diagnosis, [
            'latitude' => $latitude === null ? null : round($latitude, 3),
            'longitude' => $longitude === null ? null : round($longitude, 3),
        ]);

        return $this->diagnoses->withDetails($diagnosis->fresh());
    }

    /** Records that the farmer opened a completed review, so it stops showing as new. */
    public function markReviewSeen(Diagnosis $diagnosis): void
    {
        $review = $diagnosis->review;
        if ($review && $review->review_status !== 'pending' && ! $review->farmer_seen_at) {
            $review->update(['farmer_seen_at' => now()]);
        }
    }

    /**
     * Reopens a completed review with the farmer's reply and, optionally, a
     * new photo. The previous assessment is kept as a revision for audit.
     */
    public function followUp(Diagnosis $diagnosis, string $reply, ?UploadedFile $photo): Diagnosis
    {
        $diagnosis->loadMissing(['review', 'datasetCandidate']);
        $review = $diagnosis->review;
        if (! $review || $review->review_status === 'pending') {
            throw ValidationException::withMessages(['farmer_reply' => 'Only a completed review can be answered.']);
        }
        if ($photo && $diagnosis->datasetCandidate) {
            throw ValidationException::withMessages(['image' => 'This photo is being considered for a research dataset, so it cannot be replaced. Send your reply without a new photo.']);
        }

        $newPath = $photo ? $this->images->store($photo) : null;
        $oldPath = $diagnosis->image_path;
        try {
            DB::transaction(function () use ($diagnosis, $review, $reply, $newPath) {
            $review->revisions()->create([
                ...$review->only(['expert_id', 'review_status', 'verified_label', 'image_quality', 'next_steps', 'notes', 'farmer_message', 'farmer_reply', 'requires_field_inspection', 'reviewed_at']),
            ]);
            $review->update([
                'review_status' => 'pending', 'expert_id' => null, 'verified_label' => null, 'image_quality' => null,
                'next_steps' => null, 'notes' => null, 'farmer_message' => null, 'farmer_reply' => $reply,
                'requires_field_inspection' => false, 'requested_at' => now(), 'reviewed_at' => null, 'farmer_seen_at' => null,
            ]);
            if ($newPath) {
                $this->diagnoses->update($diagnosis, ['image_path' => $newPath]);
            }
            });
        } catch (\Throwable $exception) {
            $this->images->delete($newPath);
            throw $exception;
        }
        if ($newPath) {
            $this->images->delete($oldPath);
        }

        return $this->diagnoses->withDetails($diagnosis->fresh());
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

    /**
     * Soft-deletes the diagnosis and removes its stored media. An image that
     * was approved into a research dataset cannot be deleted here, matching
     * the consent-withdrawal rule; an unapproved nomination is discarded.
     */
    public function delete(Diagnosis $diagnosis): void
    {
        $diagnosis->loadMissing('datasetCandidate');
        if ($diagnosis->datasetCandidate?->status === 'approved') {
            throw ValidationException::withMessages([
                'diagnosis' => 'This image is already part of an approved research dataset. Contact the research team to request removal.',
            ]);
        }

        DB::transaction(function () use ($diagnosis): void {
            $diagnosis->datasetCandidate?->delete();
            $this->diagnoses->delete($diagnosis);
        });

        $this->images->delete($diagnosis->image_path, $diagnosis->gradcam_path);
    }

    public function grantResearchConsent(Diagnosis $diagnosis): Diagnosis
    {
        if (! $diagnosis->hasActiveResearchConsent()) {
            $this->diagnoses->update($diagnosis, [
                'research_consented_at' => now(),
                'research_consent_version' => config('banana.research_consent_version'),
                'research_consent_withdrawn_at' => null,
            ]);
        }

        return $diagnosis->fresh();
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
