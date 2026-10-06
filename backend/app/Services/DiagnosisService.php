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

    public function __construct(
        private readonly DiagnosisRepositoryInterface $diagnoses,
        private readonly DiseaseRepositoryInterface $diseases,
        private readonly PrivateDiagnosisImageStorage $images,
        private readonly InferenceReceiptService $receipts,
        private readonly ResearchImageService $researchImages,
    ) {}

    public function paginateForUser(User $user, array $filters, int $perPage): LengthAwarePaginator
    {
        return $this->diagnoses->paginateForUser($user, $filters, min($perPage, 100));
    }

    public function paginateAll(array $filters, int $perPage): LengthAwarePaginator
    {
        return $this->diagnoses->paginateAll($filters, min($perPage, 100));
    }

    public function create(User $user, array $attributes, ?UploadedFile $image): Diagnosis
    {
        // The account preference is authoritative for new scans. A client cannot
        // opt itself into research by setting a diagnosis request field.
        $researchConsent = $user->sharesScanForResearch($attributes['diagnosed_at'] ?? null);
        $attributes['user_id'] = $user->id;
        // The disease link always follows the model's class key so that web,
        // mobile and API records resolve to the same knowledge record.
        $attributes['disease_id'] = $this->diseases->findByModelClassKey($attributes['predicted_class'])?->id;
        $attributes['is_simulated'] = Diagnosis::isSimulatedFor(
            $attributes['source'] ?? 'web',
            isset($attributes['is_simulated']) ? (bool) $attributes['is_simulated'] : null,
        );
        $receipt = $attributes['inference_receipt'] ?? null;
        unset($attributes['inference_receipt']);
        $attributes['prediction_verified'] = $image !== null && $this->receipts->matches($receipt, $image, $attributes);
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
    public function markReviewSeen(Diagnosis $diagnosis, int $expectedVersion): void
    {
        DB::transaction(function () use ($diagnosis, $expectedVersion) {
            $locked = Diagnosis::query()->whereKey($diagnosis->id)->lockForUpdate()->firstOrFail();
            $review = $locked->review()->lockForUpdate()->first();
            if (! $review || $review->version !== $expectedVersion) {
                throw ValidationException::withMessages(['expected_review_version' => 'The assessment changed. Reload it before marking it as read.']);
            }
            if ($review->review_status !== 'pending' && ! $review->farmer_seen_at) {
                $review->update(['farmer_seen_at' => now()]);
            }
        });
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
        if ($diagnosis->datasetCandidate?->status === 'approved') {
            throw ValidationException::withMessages(['farmer_reply' => 'This image is already approved for research. Contact the research team to correct its assessment.']);
        }
        if ($photo && $diagnosis->datasetCandidate) {
            throw ValidationException::withMessages(['image' => 'This photo is being considered for a research dataset, so it cannot be replaced. Send your reply without a new photo.']);
        }

        $newPath = $photo ? $this->images->store($photo) : null;
        $oldPath = null;
        try {
            DB::transaction(function () use ($diagnosis, $reply, $newPath, &$oldPath) {
                $locked = Diagnosis::query()->whereKey($diagnosis->id)->lockForUpdate()->firstOrFail();
                $review = $locked->review()->lockForUpdate()->first();
                if (! $review || $review->review_status === 'pending') {
                    throw ValidationException::withMessages(['farmer_reply' => 'This case has already changed. Reload it before replying.']);
                }
                $candidate = $locked->datasetCandidate()->lockForUpdate()->first();
                if ($candidate?->status === 'approved') {
                    throw ValidationException::withMessages(['farmer_reply' => 'This image is already approved for research. Contact the research team to correct its assessment.']);
                }
                if ($newPath && $candidate) {
                    throw ValidationException::withMessages(['image' => 'A research candidate photo cannot be replaced.']);
                }
                $review->revisions()->create([
                    ...$review->only(['expert_id', 'review_status', 'verified_label', 'image_quality', 'next_steps', 'notes', 'farmer_message', 'farmer_reply', 'requires_field_inspection', 'reviewed_at']),
                ]);
                $review->update([
                    'review_status' => 'pending', 'expert_id' => null, 'verified_label' => null, 'image_quality' => null,
                    'next_steps' => null, 'notes' => null, 'farmer_message' => null, 'farmer_reply' => $reply,
                    'requires_field_inspection' => false, 'requested_at' => now(), 'reviewed_at' => null, 'farmer_seen_at' => null,
                    'version' => $review->version + 1,
                ]);
                if ($candidate) {
                    $candidate->update(['status' => 'uncertain', 'reviewed_by' => null, 'reviewed_at' => null]);
                }
                if ($newPath) {
                    $oldPath = $locked->image_path;
                    $this->diagnoses->update($locked, ['image_path' => $newPath]);
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
        return DB::transaction(function () use ($diagnosis, $farmerNotes, $notesProvided) {
            $locked = Diagnosis::query()->whereKey($diagnosis->id)->lockForUpdate()->firstOrFail();
            $review = $locked->review()->lockForUpdate()->first();
            if ($review && $review->review_status !== 'pending') return false;
            if ($review) {
                $review->update([
                    'requested_at' => now(),
                    'version' => $review->version + ($notesProvided && $locked->farmer_notes !== $farmerNotes ? 1 : 0),
                ]);
            } else {
                $locked->review()->create(['review_status' => 'pending', 'requested_at' => now()]);
            }
            if ($notesProvided) {
                $this->diagnoses->update($locked, ['farmer_notes' => $farmerNotes]);
            }
            return true;
        });
    }

    /** Soft-deletes the scan; an independently consented research copy remains. */
    public function delete(Diagnosis $diagnosis): void
    {
        $paths = DB::transaction(function () use ($diagnosis): array {
            $locked = Diagnosis::query()->whereKey($diagnosis->id)->lockForUpdate()->firstOrFail();
            $candidate = $locked->datasetCandidate()->lockForUpdate()->first();
            $candidate?->delete();
            $paths = [$locked->image_path, $locked->gradcam_path];
            $this->diagnoses->delete($locked);
            return $paths;
        });
        $this->images->delete(...$paths);
    }

    public function grantResearchConsent(Diagnosis $diagnosis): Diagnosis
    {
        if (! $diagnosis->user->hasResearchPhotoConsent()
            || $diagnosis->diagnosed_at->copy()->startOfSecond()->lt($diagnosis->user->research_photo_consent_at->copy()->startOfSecond())) {
            throw ValidationException::withMessages(['research_consent' => 'Enable research photo sharing in Account for future scans.']);
        }
        $this->ensureConsentAllowed($diagnosis->user, true);
        return DB::transaction(function () use ($diagnosis) {
            $locked = Diagnosis::query()->whereKey($diagnosis->id)->lockForUpdate()->firstOrFail();
            if (! $locked->hasCurrentResearchConsent()) {
                $this->diagnoses->update($locked, [
                    'research_consented_at' => now(),
                    'research_consent_version' => config('banana.research_consent_version'),
                    'research_consent_withdrawn_at' => null,
                ]);
            }
            return $locked->fresh();
        });
    }

    public function ensureConsentAllowed(User $user, bool $requested): void
    {
        if ($requested && config('banana.require_verified_email') && ! $user->hasVerifiedEmail()) {
            throw ValidationException::withMessages(['research_consent' => 'Verify your email before sharing a scan for research.']);
        }
    }

    public function withdrawResearchConsent(Diagnosis $diagnosis): string
    {
        $revokedImages = [];
        $result = DB::transaction(function () use ($diagnosis, &$revokedImages) {
            $locked = Diagnosis::withTrashed()->whereKey($diagnosis->id)->lockForUpdate()->firstOrFail();
            if (! $locked->hasActiveResearchConsent()) return self::CONSENT_INACTIVE;
            $candidate = $locked->datasetCandidate()->lockForUpdate()->first();
            $revokedImages = $this->researchImages->markRevokedForDiagnosis($locked, $locked->user, 'Farmer withdrew research consent');
            if ($candidate?->status === 'approved') {
                $candidate->update(['status' => 'rejected', 'review_notes' => 'Farmer withdrew research consent', 'reviewed_at' => now()]);
            }
            $this->diagnoses->update($locked, ['research_consent_withdrawn_at' => now()]);
            return self::CONSENT_WITHDRAWN;
        });
        foreach ($revokedImages as $image) $this->researchImages->deleteRevokedFile($image);
        return $result;
    }
}
