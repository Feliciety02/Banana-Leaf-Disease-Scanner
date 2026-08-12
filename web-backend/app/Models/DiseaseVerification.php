<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DiseaseVerification extends Model
{
    protected $fillable = ['disease_id', 'expert_id', 'status', 'notes', 'verified_at'];

    protected function casts(): array
    {
        return ['verified_at' => 'datetime'];
    }

    public function disease(): BelongsTo
    {
        return $this->belongsTo(Disease::class);
    }

    public function expert(): BelongsTo
    {
        return $this->belongsTo(User::class, 'expert_id');
    }
}
