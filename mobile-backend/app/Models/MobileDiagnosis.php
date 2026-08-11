<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MobileDiagnosis extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id', 'client_id', 'device_id', 'disease_id', 'predicted_class', 'confidence',
        'model_version', 'inference_time_ms', 'diagnosed_at', 'received_at',
    ];

    protected function casts(): array
    {
        return ['confidence' => 'float', 'inference_time_ms' => 'integer', 'diagnosed_at' => 'datetime', 'received_at' => 'datetime'];
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
