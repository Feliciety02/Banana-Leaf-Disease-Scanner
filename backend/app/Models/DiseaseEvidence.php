<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DiseaseEvidence extends Model
{
    protected $table = 'disease_evidence';

    protected $fillable = ['source_id', 'claim_type', 'claim_text', 'evidence_strength', 'notes'];

    public function disease(): BelongsTo
    {
        return $this->belongsTo(Disease::class);
    }

    public function source(): BelongsTo
    {
        return $this->belongsTo(ResearchSource::class, 'source_id');
    }
}
