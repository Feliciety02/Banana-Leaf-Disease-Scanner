<?php

namespace App\Services;

use App\Contracts\Repositories\UserRepositoryInterface;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Hash;

class UserManagementService
{
    public function __construct(private readonly UserRepositoryInterface $users) {}

    public function paginate(array $filters, int $perPage): LengthAwarePaginator
    {
        return $this->users->paginate($filters, min($perPage, 100));
    }

    public function details(User $user): User
    {
        return $this->users->withAccountMetrics($user);
    }

    public function create(array $attributes, ?string $forcedRole = null): User
    {
        if ($forcedRole) {
            $attributes['role'] = $forcedRole;
        }
        $attributes['password'] = Hash::make($attributes['password']);

        return $this->users->create($attributes);
    }

    public function update(User $user, array $attributes, ?string $forcedRole = null): User
    {
        if ($forcedRole) {
            $attributes['role'] = $forcedRole;
        }
        if (empty($attributes['password'])) {
            unset($attributes['password']);
        } else {
            $attributes['password'] = Hash::make($attributes['password']);
        }

        return $this->users->update($user, $attributes);
    }

    public function delete(User $user): void
    {
        $this->users->delete($user);
    }
}
