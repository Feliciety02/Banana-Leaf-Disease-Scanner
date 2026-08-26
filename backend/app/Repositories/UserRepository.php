<?php

namespace App\Repositories;

use App\Contracts\Repositories\UserRepositoryInterface;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class UserRepository implements UserRepositoryInterface
{
    public function findByEmail(string $email): ?User
    {
        return User::query()->where('email', $email)->first();
    }

    public function findOrFail(int $id): User
    {
        return User::query()->findOrFail($id);
    }

    public function create(array $attributes): User
    {
        return User::query()->create($attributes);
    }

    public function paginate(array $filters, int $perPage): LengthAwarePaginator
    {
        return User::query()
            ->withCount('diagnoses')
            ->withMax('diagnoses', 'diagnosed_at')
            ->latest()
            ->when($filters['search'] ?? null, fn ($query, $search) => $query->where(
                fn ($inner) => $inner->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
            ))
            ->when($filters['role'] ?? null, fn ($query, $role) => $query->where('role', $role))
            ->paginate($perPage);
    }

    public function withAccountMetrics(User $user): User
    {
        return $user->loadCount('diagnoses')->loadMax('diagnoses', 'diagnosed_at');
    }

    public function update(User $user, array $attributes): User
    {
        $user->update($attributes);

        return $user->fresh();
    }

    public function delete(User $user): void
    {
        $user->delete();
    }

    public function countByRole(string $role): int
    {
        return User::query()->where('role', $role)->count();
    }
}
