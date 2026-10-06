<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DiagnosisReview extends Model
{
    protected $touches = ['diagnosis'];

    protected $fillable = [
        'diagnosis_id', 'expert_id', 'review_status', 'verified_label', 'image_quality', 'next_steps', 'notes', 'farmer_message', 'farmer_reply',
        'requires_field_inspection', 'requested_at', 'reviewed_at', 'farmer_seen_at', 'version',
    ];

    protected function casts(): array
    {
        return [
            'requires_field_inspection' => 'boolean',
            'next_steps' => 'array',
            'requested_at' => 'datetime',
            'reviewed_at' => 'datetime',
            'farmer_seen_at' => 'datetime',
            'version' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::saved(fn (DiagnosisReview $review) => $review->diagnosis?->recordSyncChange('upsert'));
        static::deleted(fn (DiagnosisReview $review) => $review->diagnosis?->recordSyncChange('upsert'));
    }

    public function diagnosis(): BelongsTo
    {
        return $this->belongsTo(Diagnosis::class);
    }

    public function expert(): BelongsTo
    {
        return $this->belongsTo(User::class, 'expert_id');
    }

    public function revisions(): HasMany
    {
        return $this->hasMany(DiagnosisReviewRevision::class)->latest('id');
    }
}
