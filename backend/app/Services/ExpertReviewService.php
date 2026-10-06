<?php

namespace App\Services;

use App\Contracts\Repositories\DiagnosisRepositoryInterface;
use App\Contracts\Repositories\DiseaseRepositoryInterface;
use App\Models\Diagnosis;
use App\Models\ReviewClaim;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ExpertReviewService
{
    /** How long an agriculturist holds a case without activity before others may take it. */
    public const CLAIM_MINUTES = 30;

    public function __construct(
        private readonly DiagnosisRepositoryInterface $diagnoses,
        private readonly DiseaseRepositoryInterface $diseases,
        private readonly ReviewPriorityService $priority,
    ) {}

    public function cases(string $scope): Collection
    {
        $confidenceThreshold = (float) config('banana.confidence_threshold');
        $cases = $this->diagnoses->reviewCases($scope, $confidenceThreshold);

        return $scope === 'reviewed' ? $cases : $this->priority->rank($cases, $confidenceThreshold);
    }

    public function dashboard(): array
    {
        $confidenceThreshold = (float) config('banana.confidence_threshold');
        $summary = $this->diagnoses->expertDashboard($confidenceThreshold);

        return [
            'needs_review' => $summary['needs_review'],
            'uncertain_results' => $summary['uncertain'],
            'farmer_review_requests' => $summary['pending_requests'],
            'disease_content_awaiting_verification' => $this->diseases->countByVerificationStatus('researched'),
            'cases' => $this->priority->rank($summary['cases'], $confidenceThreshold)->take(6),
        ];
    }

    /**
     * The farmer's most recent other scans, so an agriculturist can see patterns
     * (for example the same disease reported repeatedly) before deciding.
     */
    public function farmerHistory(Diagnosis $diagnosis, int $limit = 10): Collection
    {
        return Diagnosis::query()
            ->with('review:id,diagnosis_id,review_status,verified_label,reviewed_at')
            ->where('user_id', $diagnosis->user_id)
            ->whereKeyNot($diagnosis->id)
            ->latest('diagnosed_at')
            ->limit($limit)
            ->get();
    }

    public function details(Diagnosis $diagnosis): Diagnosis
    {
        return $this->diagnoses->withDetails($diagnosis, true);
    }

    /**
     * Marks the case as being worked on by this agriculturist, or renews their claim.
     * Refused while another agriculturist holds an active claim.
     */
    public function claim(User $expert, Diagnosis $diagnosis): ReviewClaim
    {
        return DB::transaction(function () use ($expert, $diagnosis) {
            $locked = Diagnosis::query()->whereKey($diagnosis->id)->lockForUpdate()->firstOrFail();
            if ($locked->review()->where('review_status', '!=', 'pending')->exists()) {
                throw ValidationException::withMessages(['review_status' => 'This case already has an assessment. Reload it to view the completed review.']);
            }
            $claim = ReviewClaim::query()->where('diagnosis_id', $diagnosis->id)->lockForUpdate()->first();
            $this->ensureNotHeldByAnother($expert, $claim);
            // Only a newly started review is news for the farmer; renewals are not.
            $started = ! $claim || ! $claim->isActive();
            $claim ??= new ReviewClaim(['diagnosis_id' => $diagnosis->id]);
            $claim->fill(['user_id' => $expert->id, 'expires_at' => now()->addMinutes(self::CLAIM_MINUTES)])->save();
            if ($started) {
                $diagnosis->recordSyncChange('upsert');
            }

            return $claim->load('user:id,name');
        });
    }

    public function release(User $expert, Diagnosis $diagnosis): void
    {
        if (ReviewClaim::query()->where('diagnosis_id', $diagnosis->id)->where('user_id', $expert->id)->delete()) {
            $diagnosis->recordSyncChange('upsert');
        }
    }

    private function ensureNotHeldByAnother(User $expert, ?ReviewClaim $claim): void
    {
        if ($claim && $claim->user_id !== $expert->id && $claim->isActive()) {
            $name = $claim->user?->name ?? 'another agriculturist';
            throw ValidationException::withMessages([
                'review_status' => "{$name} is reviewing this case right now. Choose another case, or try again after {$claim->expires_at->format('H:i')}.",
            ]);
        }
    }

    public function save(User $expert, Diagnosis $diagnosis, array $attributes): Diagnosis
    {
        return DB::transaction(function () use ($expert, $diagnosis, $attributes) {
            // All changes to a case lock the diagnosis first, then inspect fresh state.
            $locked = Diagnosis::query()->whereKey($diagnosis->id)->lockForUpdate()->firstOrFail();
            $claim = ReviewClaim::query()->with('user:id,name')->where('diagnosis_id', $locked->id)->lockForUpdate()->first();
            $this->ensureNotHeldByAnother($expert, $claim);
            $previous = $locked->review()->lockForUpdate()->first();
            if ((int) ($attributes['expected_review_version'] ?? 0) !== (int) ($previous?->version ?? 0)) {
                throw ValidationException::withMessages(['expected_review_version' => 'This case changed while it was open. Reload it before saving your assessment.']);
            }
            if ($locked->datasetCandidate()->where('status', 'approved')->exists()) {
                throw ValidationException::withMessages(['review_status' => 'This image is in an approved research dataset, so its agricultural assessment is locked.']);
            }
            if ($attributes['review_status'] !== 'alternate_class') {
                $attributes['verified_label'] = $attributes['review_status'] === 'confirmed' ? $locked->predicted_class : null;
            }
            unset($attributes['expected_review_version']);
            if ($previous && $previous->review_status !== 'pending') {
                $reason = trim((string) ($attributes['revision_reason'] ?? ''));
                if ($reason === '') {
                    throw ValidationException::withMessages(['revision_reason' => 'Explain why this completed assessment is being revised.']);
                }
                $previous->revisions()->create([
                    ...$previous->only(['expert_id', 'review_status', 'verified_label', 'image_quality', 'next_steps', 'notes', 'farmer_message', 'farmer_reply', 'requires_field_inspection', 'reviewed_at']),
                    'replaced_by' => $expert->id,
                    'revision_reason' => $reason,
                ]);
            }
            unset($attributes['revision_reason']);
            ReviewClaim::query()->where('diagnosis_id', $locked->id)->delete();
            return $this->diagnoses->saveReview($locked, [
                ...$attributes,
                'version' => ($previous?->version ?? 0) + 1,
                'expert_id' => $expert->id,
                'requires_field_inspection' => $attributes['review_status'] === 'field_or_laboratory_required'
                    || in_array('seek_field_inspection', $attributes['next_steps'], true),
                'reviewed_at' => now(),
                // A new or changed assessment is unread until the farmer opens it.
                'farmer_seen_at' => null,
            ]);
        });
    }
}
