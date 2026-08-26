<?php

namespace App\Services;

use App\Contracts\Repositories\UserRepositoryInterface;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

class AccountService
{
    public function __construct(private readonly UserRepositoryInterface $users) {}

    public function updateProfile(User $user, array $attributes): User
    {
        $emailChanged = isset($attributes['email']) && $attributes['email'] !== $user->email;
        $user = $this->users->update($user, $attributes);

        if ($emailChanged) {
            $user->forceFill(['email_verified_at' => null])->save();
            $user->sendEmailVerificationNotification();
        }

        return $user->fresh();
    }

    public function updatePassword(User $user, string $password): void
    {
        $user->update(['password' => Hash::make($password)]);
        $user->tokens()->whereKeyNot($user->currentAccessToken()?->getKey())->delete();
    }

    public function delete(User $user): void
    {
        $user->tokens()->delete();
        $this->users->delete($user);
    }

    public function credentialsMatch(string $email, string $password): ?User
    {
        $user = $this->users->findByEmail(strtolower($email));

        return $user && Hash::check($password, $user->password) ? $user : null;
    }

    public function verifyEmail(int $id, string $hash): User
    {
        $user = $this->users->findOrFail($id);
        abort_unless(hash_equals($hash, sha1($user->getEmailForVerification())), 403);

        if (! $user->hasVerifiedEmail()) {
            $user->markEmailAsVerified();
        }

        return $user;
    }
}
