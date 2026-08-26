<?php

namespace App\Repositories;

use App\Contracts\Repositories\DatasetCandidateRepositoryInterface;
use App\Models\DatasetCandidate;
use App\Models\Diagnosis;
use Illuminate\Database\Eloquent\Collection;

class DatasetCandidateRepository implements DatasetCandidateRepositoryInterface
{
    private const DETAILS = [
        'diagnosis.user',
        'diagnosis.disease',
        'diagnosis.review.expert',
        'proposer:id,name',
        'reviewer:id,name',
    ];

    public function all(?string $status = null): Collection
    {
        return DatasetCandidate::query()
            ->with(self::DETAILS)
            ->latest()
            ->when($status, fn ($query) => $query->where('status', $status))
            ->get();
    }

    public function firstOrCreate(Diagnosis $diagnosis, int $proposerId): DatasetCandidate
    {
        return DatasetCandidate::query()->firstOrCreate(
            ['diagnosis_id' => $diagnosis->id],
            ['proposed_by' => $proposerId, 'status' => 'pending'],
        );
    }

    public function update(DatasetCandidate $candidate, array $attributes): DatasetCandidate
    {
        $candidate->update($attributes);

        return $candidate->fresh();
    }

    public function withDetails(DatasetCandidate $candidate): DatasetCandidate
    {
        return $candidate->load(self::DETAILS);
    }

    public function countByStatus(string $status): int
    {
        return DatasetCandidate::query()->where('status', $status)->count();
    }
}
