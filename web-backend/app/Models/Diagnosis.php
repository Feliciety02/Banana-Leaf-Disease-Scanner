<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Diagnosis extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id', 'disease_id', 'predicted_class', 'confidence', 'image_path', 'gradcam_path',
        'model_version', 'inference_time_ms', 'source', 'is_simulated', 'sync_uuid', 'sync_status', 'diagnosed_at',
        'expert_review_status', 'expert_verified_label', 'expert_notes', 'expert_id', 'expert_reviewed_at',
    ];

    protected function casts(): array
    {
        return ['confidence' => 'float', 'inference_time_ms' => 'integer', 'is_simulated' => 'boolean', 'diagnosed_at' => 'datetime', 'expert_reviewed_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        static::updating(function (Diagnosis $diagnosis) {
            $immutable = ['predicted_class', 'confidence', 'model_version', 'inference_time_ms', 'diagnosed_at', 'is_simulated'];
            if (collect($immutable)->contains(fn ($field) => $diagnosis->isDirty($field))) {
                throw new \LogicException('Original model prediction fields are immutable.');
            }
        });
    }

    public function disease(): BelongsTo
    {
        return $this->belongsTo(Disease::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
