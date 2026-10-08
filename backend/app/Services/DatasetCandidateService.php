<?php

namespace App\Services;

use App\Contracts\Repositories\DatasetCandidateRepositoryInterface;
use App\Models\DatasetCandidate;
use App\Models\Diagnosis;
use App\Models\ResearchImage;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class DatasetCandidateService
{
    public function __construct(
        private readonly DatasetCandidateRepositoryInterface $candidates,
        private readonly ResearchImageService $researchImages,
    ) {}

    public function nominate(User $proposer, Diagnosis $diagnosis): DatasetCandidate
    {
        $diagnosis->load('review');
        if (! $diagnosis->image_path) {
            throw ValidationException::withMessages(['diagnosis' => 'Only diagnoses with a retained image can become research candidates.']);
        }
        if (! $diagnosis->hasCurrentResearchConsent()) {
            throw ValidationException::withMessages(['diagnosis' => 'The farmer must give active research-image consent before this image can be nominated.']);
        }
        if (! $diagnosis->review || $diagnosis->review->review_status === 'pending') {
            throw ValidationException::withMessages(['diagnosis' => 'Complete the agricultural review before nominating this image.']);
        }

        return $this->candidates->withDetails($this->candidates->firstOrCreate($diagnosis, $proposer->id));
    }

    /** Queue an eligible reviewed scan automatically; a person still decides whether to retain it. */
    public function nominateIfEligible(Diagnosis $diagnosis): ?DatasetCandidate
    {
        $diagnosis->loadMissing('review');
        if (! $diagnosis->image_path || ! $diagnosis->hasCurrentResearchConsent()
            || ! $diagnosis->review || $diagnosis->review->review_status === 'pending') {
            return null;
        }

        $candidate = $this->candidates->firstOrCreate($diagnosis, $diagnosis->review->expert_id);
        // A farmer reply makes an undecided candidate stale. Once the new
        // assessment is complete, return only that stale item to the queue.
        if ($candidate->status === 'uncertain' && $candidate->reviewed_by === null) {
            $candidate = $this->candidates->update($candidate, ['status' => 'pending', 'review_notes' => null]);
        }

        return $candidate;
    }

    public function decide(User $reviewer, DatasetCandidate $candidate, array $attributes): DatasetCandidate
    {
        $copiedPath = null;
        try {
            return DB::transaction(function () use ($reviewer, $candidate, $attributes, &$copiedPath) {
                $diagnosis = Diagnosis::query()->whereKey($candidate->diagnosis_id)->lockForUpdate()->first();
                $locked = DatasetCandidate::query()->whereKey($candidate->id)->lockForUpdate()->firstOrFail();
                if (! $diagnosis) {
                    throw ValidationException::withMessages(['status' => 'The diagnosis for this candidate was deleted, so no dataset decision can be recorded.']);
                }
                if ($locked->proposed_by !== null && $locked->proposed_by === $reviewer->id) {
                    throw ValidationException::withMessages(['status' => 'You nominated this image. Another agriculturist or an administrator must record the dataset decision.']);
                }
                if ($diagnosis->review()->where('expert_id', $reviewer->id)->exists()) {
                    throw ValidationException::withMessages(['status' => 'You assessed this scan. Another agriculturist or an administrator must decide on its dataset use.']);
                }
                $retained = ResearchImage::query()->where('source_candidate_id', $locked->id)->whereNull('revoked_at')->exists();
                if ($retained) {
                    throw ValidationException::withMessages(['status' => 'This research copy is already approved. Withdraw consent or use the research removal action to remove it.']);
                }
                if ($attributes['status'] === 'approved') {
                    if (! $diagnosis->hasCurrentResearchConsent()) {
                        throw ValidationException::withMessages(['status' => 'Current research-copy consent is required before approval. Ask the farmer to renew consent.']);
                    }
                    $review = $diagnosis->review()->lockForUpdate()->first();
                    if (! $review || ! in_array($review->review_status, ['confirmed', 'alternate_class'], true) || $review->image_quality !== 'good') {
                        throw ValidationException::withMessages(['status' => 'A completed, determinate agricultural assessment of a clear image is required before approval.']);
                    }
                    $diagnosis->setRelation('review', $review);
                    $copy = $this->researchImages->approve($locked, $diagnosis, $reviewer);
                    $copiedPath = $copy->image_path;
                }
                return $this->candidates->withDetails($this->candidates->update($locked, [
                    ...$attributes,
                    'reviewed_by' => $reviewer->id,
                    'reviewed_at' => now(),
                ]));
            });
        } catch (\Throwable $exception) {
            if ($copiedPath) Storage::disk('local')->delete($copiedPath);
            throw $exception;
        }
    }
}
