<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DiagnosisSyncChange extends Model
{
    protected $fillable = [
        'user_id', 'diagnosis_id', 'sync_uuid', 'change_type',
    ];

    public function diagnosis(): BelongsTo
    {
        return $this->belongsTo(Diagnosis::class)->withTrashed();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
