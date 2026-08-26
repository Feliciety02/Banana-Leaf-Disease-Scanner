<?php

namespace App\Contracts\Repositories;

use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

interface UserRepositoryInterface
{
    public function findByEmail(string $email): ?User;

    public function findOrFail(int $id): User;

    public function create(array $attributes): User;

    public function paginate(array $filters, int $perPage): LengthAwarePaginator;

    public function withAccountMetrics(User $user): User;

    public function update(User $user, array $attributes): User;

    public function delete(User $user): void;

    public function countByRole(string $role): int;
}
