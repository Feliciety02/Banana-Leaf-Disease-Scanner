<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PesticideRegulatoryCheck extends Model
{
    protected $fillable = [
        'source_id', 'product_name', 'active_ingredient', 'permitted_crop', 'permitted_target',
        'registration_number', 'registration_status', 'registration_expires_at', 'approved_label_url',
        'checked_at', 'checked_by', 'notes',
    ];

    protected function casts(): array
    {
        return ['registration_expires_at' => 'date', 'checked_at' => 'datetime'];
    }

    public function management(): BelongsTo
    {
        return $this->belongsTo(DiseaseManagement::class, 'disease_management_id');
    }

    public function source(): BelongsTo
    {
        return $this->belongsTo(ResearchSource::class, 'source_id');
    }
}
