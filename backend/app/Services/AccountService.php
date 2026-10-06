<?php

namespace App\Services;

use App\Contracts\Repositories\UserRepositoryInterface;
use App\Models\User;
use App\Models\ResearchImage;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;

class AccountService
{
    public function __construct(
        private readonly UserRepositoryInterface $users,
        private readonly PrivateDiagnosisImageStorage $images,
        private readonly ResearchImageService $researchImages,
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

    /** Replaces the profile photo; the previous file is removed after the new one is saved. */
    public function updateAvatar(User $user, UploadedFile $photo): User
    {
        $previous = $user->avatar_path;
        $user->forceFill(['avatar_path' => $this->images->store($photo, 'avatars', 512, 'webp')])->save();
        $this->images->delete($previous);

        return $user->fresh();
    }

    public function removeAvatar(User $user): User
    {
        $previous = $user->avatar_path;
        $user->forceFill(['avatar_path' => null])->save();
        $this->images->delete($previous);

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
     * Deletes account-owned data. Separate consented research copies remain
     * unless the farmer explicitly asks to remove them too.
     */
    public function delete(User $user, bool $removeResearchCopies = false): void
    {
        [$storedPaths, $revokedImages] = DB::transaction(function () use ($user, $removeResearchCopies): array {
            $diagnoses = $user->diagnoses()->withTrashed()->lockForUpdate()->get(['id', 'image_path', 'gradcam_path']);
            $paths = $diagnoses->flatMap(fn ($diagnosis) => [$diagnosis->image_path, $diagnosis->gradcam_path])
                ->push($user->avatar_path)->all();
            $research = ResearchImage::query()->where('source_user_id', $user->id)->lockForUpdate()->get();
            $revoked = [];
            foreach ($research as $image) {
                if ($removeResearchCopies) {
                    if (! $image->revoked_at) {
                        $image->update(['revoked_at' => now(), 'revoked_by' => $user->id, 'revocation_reason' => 'Farmer removed research copies during account deletion']);
                    }
                    if ($image->image_path) $revoked[] = $image;
                }
                $image->update(['source_user_id' => null]);
            }
            $user->tokens()->delete();
            DB::table('sessions')->where('user_id', $user->getKey())->delete();
            $this->users->delete($user);
            return [$paths, $revoked];
        });

        $this->images->delete(...$storedPaths);
        foreach ($revokedImages as $image) $this->researchImages->deleteRevokedFile($image);
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
