<?php

namespace App\Services;

use App\Contracts\Repositories\UserRepositoryInterface;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

class AuthenticationService
{
    public function __construct(private readonly UserRepositoryInterface $users) {}

    public function register(array $attributes, string $deviceName): array
    {
        $user = $this->users->create([
            ...$attributes,
            'password' => Hash::make($attributes['password']),
            'role' => 'farmer',
        ]);
        $user->sendEmailVerificationNotification();

        return ['user' => $user, 'token' => $this->createToken($user, $deviceName)];
    }

    public function authenticate(string $email, string $password, string $deviceName): ?array
    {
        $user = $this->users->findByEmail(Str::lower($email));
        if (! $user || ! Hash::check($password, $user->password)) {
            return null;
        }

        return ['user' => $user, 'token' => $this->createToken($user, $deviceName)];
    }

    public function resetPassword(array $credentials): string
    {
        $credentials['email'] = Str::lower($credentials['email']);

        return Password::reset($credentials, function (User $user, string $password): void {
            $user->forceFill([
                'password' => Hash::make($password),
                'remember_token' => Str::random(60),
            ])->save();
            $user->tokens()->delete();
        });
    }

    public function logout(User $user): void
    {
        $user->currentAccessToken()?->delete();
    }

    public function resendVerification(User $user): bool
    {
        if ($user->hasVerifiedEmail()) {
            return false;
        }

        $user->sendEmailVerificationNotification();

        return true;
    }

    private function createToken(User $user, string $deviceName): string
    {
        return $user->createToken($deviceName)->plainTextToken;
    }
}
