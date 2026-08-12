<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DiseaseSymptom extends Model
{
    protected $fillable = ['stage', 'plant_part', 'symptom', 'visible_in_leaf_image', 'farmer_friendly_text', 'sort_order'];

    protected function casts(): array
    {
        return ['visible_in_leaf_image' => 'boolean', 'sort_order' => 'integer'];
    }

    public function disease(): BelongsTo
    {
        return $this->belongsTo(Disease::class);
    }
}
