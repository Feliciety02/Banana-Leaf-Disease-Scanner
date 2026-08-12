<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Disease extends Model
{
    use HasFactory;

    protected $fillable = [
        'slug', 'model_class_key', 'name', 'alternative_names', 'scientific_name', 'causal_agent', 'pathogen_type',
        'short_description', 'farmer_summary', 'curative_status', 'verification_status', 'evidence_level',
        'is_verified', 'last_reviewed_at', 'regulatory_checked_at', 'verified_at', 'verified_by',
        'image_only_limitations', 'professional_referral', 'description', 'symptoms', 'management', 'prevention', 'image_path',
    ];

    protected function casts(): array
    {
        return [
            'symptoms' => 'array', 'alternative_names' => 'array', 'is_verified' => 'boolean',
            'last_reviewed_at' => 'datetime', 'regulatory_checked_at' => 'datetime', 'verified_at' => 'datetime',
        ];
    }

    public function diagnoses(): HasMany
    {
        return $this->hasMany(Diagnosis::class);
    }

    public function symptomRecords(): HasMany
    {
        return $this->hasMany(DiseaseSymptom::class)->orderBy('sort_order');
    }

    public function managementRecords(): HasMany
    {
        return $this->hasMany(DiseaseManagement::class)->orderBy('sort_order');
    }

    public function evidence(): HasMany
    {
        return $this->hasMany(DiseaseEvidence::class);
    }

    public function verifier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by');
    }
}
