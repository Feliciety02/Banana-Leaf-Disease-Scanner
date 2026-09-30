<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DiagnosisReviewRevision extends Model
{
    protected $fillable = [
        'diagnosis_review_id', 'expert_id', 'review_status', 'verified_label', 'image_quality', 'next_steps', 'notes',
        'requires_field_inspection', 'reviewed_at', 'replaced_by',
    ];

    protected function casts(): array
    {
        return [
            'requires_field_inspection' => 'boolean',
            'next_steps' => 'array',
            'reviewed_at' => 'datetime',
        ];
    }

    public function review(): BelongsTo
    {
        return $this->belongsTo(DiagnosisReview::class, 'diagnosis_review_id');
    }

    public function expert(): BelongsTo
    {
        return $this->belongsTo(User::class, 'expert_id');
    }
}
