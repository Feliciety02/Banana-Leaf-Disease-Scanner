<?php

namespace App\Contracts\Repositories;

use App\Models\DatasetCandidate;
use App\Models\Diagnosis;
use Illuminate\Database\Eloquent\Collection;

interface DatasetCandidateRepositoryInterface
{
    public function all(?string $status = null): Collection;

    public function firstOrCreate(Diagnosis $diagnosis, int $proposerId): DatasetCandidate;

    public function update(DatasetCandidate $candidate, array $attributes): DatasetCandidate;

    public function withDetails(DatasetCandidate $candidate): DatasetCandidate;

    public function countByStatus(string $status): int;
}
