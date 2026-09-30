<?php

namespace App\Services;

use App\Contracts\Repositories\UserRepositoryInterface;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;

class AccountService
{
    public function __construct(
        private readonly UserRepositoryInterface $users,
        private readonly PrivateDiagnosisImageStorage $images,
    ) {}

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

    public function updatePassword(User $user, string $password, ?string $currentSessionId = null): void
    {
        $user->forceFill([
            'password' => Hash::make($password),
            'remember_token' => Str::random(60),
        ])->save();

        $currentToken = $user->currentAccessToken();
        if ($currentToken instanceof PersonalAccessToken) {
            $user->tokens()->whereKeyNot($currentToken->getKey())->delete();
        } else {
            $user->tokens()->delete();
        }

        $sessions = DB::table('sessions')->where('user_id', $user->getKey());
        if ($currentSessionId !== null) {
            $sessions->where('id', '!=', $currentSessionId);
        }
        $sessions->delete();
    }

    /**
     * Deletes the account with its server data. Diagnosis rows, reviews and
     * dataset candidates are removed by the database cascade; stored images
     * are removed here because the cascade cannot reach the file system.
     */
    public function delete(User $user): void
    {
        $storedPaths = $user->diagnoses()
            ->withTrashed()
            ->get(['image_path', 'gradcam_path'])
            ->flatMap(fn ($diagnosis) => [$diagnosis->image_path, $diagnosis->gradcam_path])
            ->all();

        DB::transaction(function () use ($user): void {
            $user->tokens()->delete();
            DB::table('sessions')->where('user_id', $user->getKey())->delete();
            $this->users->delete($user);
        });

        $this->images->delete(...$storedPaths);
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
