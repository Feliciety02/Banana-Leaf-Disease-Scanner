<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ResearchImage extends Model
{
    protected $fillable = [
        'source_user_id', 'source_diagnosis_id', 'source_candidate_id',
        'image_path', 'sha256', 'verified_label', 'consent_version',
        'consented_at', 'approved_by', 'approved_at',
        'revoked_by', 'revoked_at', 'revocation_reason',
    ];

    protected function casts(): array
    {
        return [
            'consented_at' => 'datetime', 'approved_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function revoker(): BelongsTo
    {
        return $this->belongsTo(User::class, 'revoked_by');
    }
}
