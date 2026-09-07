<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DiagnosisReview extends Model
{
    protected $touches = ['diagnosis'];

    protected $fillable = [
        'diagnosis_id', 'expert_id', 'review_status', 'verified_label', 'image_quality', 'next_steps', 'notes',
        'requires_field_inspection', 'requested_at', 'reviewed_at',
    ];

    protected function casts(): array
    {
        return [
            'requires_field_inspection' => 'boolean',
            'next_steps' => 'array',
            'requested_at' => 'datetime',
            'reviewed_at' => 'datetime',
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
}
