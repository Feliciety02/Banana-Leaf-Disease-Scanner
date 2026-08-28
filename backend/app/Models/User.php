<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
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
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
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
            'password' => 'hashed',
        ];
    }

    public function diagnoses(): HasMany
    {
        return $this->hasMany(Diagnosis::class);
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
