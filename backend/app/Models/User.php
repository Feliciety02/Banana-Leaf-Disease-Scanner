<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable implements MustVerifyEmail
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    public const ROLE_FARMER = 'farmer';

    public const ROLE_AGRICULTURAL_EXPERT = 'agricultural_expert';

    public const ROLE_ADMIN = 'admin';

    public const ROLES = [self::ROLE_FARMER, self::ROLE_AGRICULTURAL_EXPERT, self::ROLE_ADMIN];

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'terms_accepted_at',
        'terms_version',
        'research_photo_consent_at',
        'research_photo_consent_version',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
        'avatar_path',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'terms_accepted_at' => 'datetime',
            'research_photo_consent_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function diagnoses(): HasMany
    {
        return $this->hasMany(Diagnosis::class);
    }

    public function hasResearchPhotoConsent(): bool
    {
        return $this->isFarmer()
            && $this->research_photo_consent_at !== null
            && $this->research_photo_consent_version === config('banana.research_consent_version');
    }

    /**
     * Whether a scan made at the given time is shared for research
     * automatically: only scans made after the farmer opted in, and only once
     * the email is verified when the deployment requires it.
     */
    public function sharesScanForResearch(mixed $diagnosedAt): bool
    {
        return $this->hasResearchPhotoConsent()
            && (! config('banana.require_verified_email') || $this->hasVerifiedEmail())
            && Carbon::parse($diagnosedAt ?? now())->startOfSecond()->gte($this->research_photo_consent_at->copy()->startOfSecond());
    }

    public function diagnosisReviews(): HasMany
    {
        return $this->hasMany(DiagnosisReview::class, 'expert_id');
    }

    public function diseaseVerifications(): HasMany
    {
        return $this->hasMany(DiseaseVerification::class, 'expert_id');
    }

    public function isAdmin(): bool
    {
        return $this->hasRole(self::ROLE_ADMIN);
    }

    public function isFarmer(): bool
    {
        return $this->hasRole(self::ROLE_FARMER);
    }

    public function isAgriculturalExpert(): bool
    {
        return $this->hasRole(self::ROLE_AGRICULTURAL_EXPERT);
    }

    public function hasRole(string ...$roles): bool
    {
        return in_array($this->role, $roles, true);
    }
}
