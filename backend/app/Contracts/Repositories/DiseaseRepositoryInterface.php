<?php

namespace App\Contracts\Repositories;

use App\Models\Disease;
use Illuminate\Database\Eloquent\Collection;

interface DiseaseRepositoryInterface
{
    public function verified(): Collection;

    public function findBySlug(string $slug): ?Disease;

    public function withScientificContent(Disease $disease): Disease;

    public function forAdministration(array $filters, bool $withVerifications = false): Collection;

    public function withAdministrationDetails(Disease $disease): Disease;

    public function create(array $attributes): Disease;

    public function update(Disease $disease, array $attributes): Disease;

    public function invalidateVerification(Disease $disease): void;

    public function countByVerificationStatus(string $status): int;
}
