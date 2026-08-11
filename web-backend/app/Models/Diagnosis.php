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
        'model_version', 'inference_time_ms', 'source', 'sync_uuid', 'sync_status', 'diagnosed_at',
    ];

    protected function casts(): array
    {
        return ['confidence' => 'float', 'inference_time_ms' => 'integer', 'diagnosed_at' => 'datetime'];
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
