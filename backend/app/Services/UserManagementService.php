<?php

namespace App\Services;

use App\Contracts\Repositories\UserRepositoryInterface;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Hash;

class UserManagementService
{
    public function __construct(
        private readonly UserRepositoryInterface $users,
        private readonly AccountService $accounts,
    ) {}

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

        $user = $this->users->create($attributes);
        $user->sendEmailVerificationNotification();

        return $user;
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

        $emailChanged = isset($attributes['email']) && $attributes['email'] !== $user->email;
        $user = $this->users->update($user, $attributes);
        if ($emailChanged) {
            $user->forceFill(['email_verified_at' => null])->save();
            $user->sendEmailVerificationNotification();
        }

        return $user->fresh();
    }

    public function delete(User $user): void
    {
        $this->accounts->delete($user);
    }
}
