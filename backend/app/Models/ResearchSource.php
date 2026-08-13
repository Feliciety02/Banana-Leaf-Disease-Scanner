<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ResearchSource extends Model
{
    protected $fillable = ['title', 'authors', 'year', 'journal_or_institution', 'source_type', 'volume', 'issue', 'pages', 'doi', 'reference_url', 'country_or_region', 'peer_reviewed', 'philippines_specific', 'publication_date', 'accessed_at', 'notes', 'created_by'];

    protected function casts(): array
    {
        return ['year' => 'integer', 'peer_reviewed' => 'boolean', 'philippines_specific' => 'boolean', 'publication_date' => 'date', 'accessed_at' => 'datetime'];
    }

    public function evidence(): HasMany
    {
        return $this->hasMany(DiseaseEvidence::class, 'source_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
