<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DiseaseManagement extends Model
{
    protected $table = 'disease_management';

    protected $fillable = ['category', 'recommendation', 'farmer_friendly_text', 'evidence_strength', 'requires_professional', 'regulatory_check_required', 'regulatory_checked_at', 'sort_order'];

    protected function casts(): array
    {
        return ['requires_professional' => 'boolean', 'regulatory_check_required' => 'boolean', 'regulatory_checked_at' => 'datetime', 'sort_order' => 'integer'];
    }

    public function disease(): BelongsTo
    {
        return $this->belongsTo(Disease::class);
    }

    public function regulatoryChecks(): HasMany
    {
        return $this->hasMany(PesticideRegulatoryCheck::class);
    }
}
