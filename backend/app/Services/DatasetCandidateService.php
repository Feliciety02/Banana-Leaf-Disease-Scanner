<?php

namespace App\Services;

use App\Contracts\Repositories\DatasetCandidateRepositoryInterface;
use App\Models\DatasetCandidate;
use App\Models\Diagnosis;
use App\Models\User;
use Illuminate\Validation\ValidationException;

class DatasetCandidateService
{
    public function __construct(private readonly DatasetCandidateRepositoryInterface $candidates) {}

    public function nominate(User $proposer, Diagnosis $diagnosis): DatasetCandidate
    {
        $diagnosis->load('review');
        if (! $diagnosis->image_path) {
            throw ValidationException::withMessages(['diagnosis' => 'Only diagnoses with a retained image can become research candidates.']);
        }
        if (! $diagnosis->hasActiveResearchConsent()) {
            throw ValidationException::withMessages(['diagnosis' => 'The farmer must give active research-image consent before this image can be nominated.']);
        }
        if (! $diagnosis->review || $diagnosis->review->review_status === 'pending') {
            throw ValidationException::withMessages(['diagnosis' => 'Complete the agricultural review before nominating this image.']);
        }

        return $this->candidates->withDetails($this->candidates->firstOrCreate($diagnosis, $proposer->id));
    }

    public function decide(User $reviewer, DatasetCandidate $candidate, array $attributes): DatasetCandidate
    {
        $candidate->load('diagnosis');
        if (! $candidate->diagnosis) {
            throw ValidationException::withMessages(['status' => 'The diagnosis for this candidate was deleted, so no dataset decision can be recorded.']);
        }
        // Separation of duties: the person who nominated an image cannot also
        // approve or reject it. Another reviewer or an administrator decides.
        if ($candidate->proposed_by !== null && $candidate->proposed_by === $reviewer->id) {
            throw ValidationException::withMessages(['status' => 'You nominated this image. Another agricultural reviewer or an administrator must record the dataset decision.']);
        }
        if ($attributes['status'] === 'approved' && ! $candidate->diagnosis->hasActiveResearchConsent()) {
            throw ValidationException::withMessages(['status' => 'This candidate cannot be approved because research consent is missing or was withdrawn.']);
        }

        $candidate = $this->candidates->update($candidate, [
            ...$attributes,
            'reviewed_by' => $reviewer->id,
            'reviewed_at' => now(),
        ]);

        return $this->candidates->withDetails($candidate);
    }
}
