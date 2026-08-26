<?php

namespace App\Contracts\Repositories;

use App\Models\ResearchSource;
use Illuminate\Database\Eloquent\Collection;

interface ResearchSourceRepositoryInterface
{
    public function all(array $filters): Collection;

    public function findOrFail(int $id): ResearchSource;

    public function create(array $attributes): ResearchSource;

    public function update(ResearchSource $source, array $attributes): ResearchSource;

    public function hasEvidence(ResearchSource $source): bool;

    public function delete(ResearchSource $source): void;
}
