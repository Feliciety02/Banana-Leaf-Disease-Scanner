<?php

namespace App\Contracts\Repositories;

use App\Models\Diagnosis;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Collection;

interface DiagnosisRepositoryInterface
{
    public function paginateForUser(User $user, array $filters, int $perPage): LengthAwarePaginator;

    public function paginateAll(array $filters, int $perPage): LengthAwarePaginator;

    public function create(array $attributes): Diagnosis;

    public function findBySyncUuid(string $syncUuid): ?Diagnosis;

    public function findOwnedBySyncUuid(string $syncUuid, int $userId): Diagnosis;

    public function withDetails(Diagnosis $diagnosis, bool $includeUser = false): Diagnosis;

    public function update(Diagnosis $diagnosis, array $attributes): Diagnosis;

    public function delete(Diagnosis $diagnosis): void;

    public function reviewCases(string $scope, float $threshold, int $limit = 100): Collection;

    public function expertDashboard(float $threshold, int $limit = 100): array;

    public function saveReview(Diagnosis $diagnosis, array $attributes): Diagnosis;
}
