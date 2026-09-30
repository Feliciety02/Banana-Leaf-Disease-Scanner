<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Diagnosis extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id', 'disease_id', 'predicted_class', 'confidence', 'image_path', 'gradcam_path', 'farmer_notes',
        'research_consented_at', 'research_consent_version', 'research_consent_withdrawn_at',
        'model_version', 'inference_time_ms', 'source', 'is_simulated', 'sync_uuid', 'sync_status', 'diagnosed_at',
        'class_probabilities', 'model_comparison',
    ];

    /**
     * Mobile records always come from the bundled on-device model, so they are
     * real predictions regardless of the server's AI mode. Web records depend
     * on the server inference configuration.
     */
    public static function isSimulatedFor(string $source): bool
    {
        return $source !== 'mobile' && config('banana.ai_mode') !== 'PRODUCTION';
    }

    protected function casts(): array
    {
        return [
            'confidence' => 'float',
            'inference_time_ms' => 'integer',
            'is_simulated' => 'boolean',
            'class_probabilities' => 'array',
            'model_comparison' => 'array',
            'diagnosed_at' => 'datetime',
            'research_consented_at' => 'datetime',
            'research_consent_withdrawn_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::created(fn (Diagnosis $diagnosis) => $diagnosis->recordSyncChange('upsert'));

        static::updating(function (Diagnosis $diagnosis) {
            $immutable = ['predicted_class', 'confidence', 'model_version', 'inference_time_ms', 'diagnosed_at', 'is_simulated', 'class_probabilities', 'model_comparison'];
            if (collect($immutable)->contains(fn ($field) => $diagnosis->isDirty($field))) {
                throw new \LogicException('Original model prediction fields are immutable.');
            }
        });

        static::updated(fn (Diagnosis $diagnosis) => $diagnosis->recordSyncChange('upsert'));
        static::deleted(fn (Diagnosis $diagnosis) => $diagnosis->recordSyncChange('delete'));
        static::restored(fn (Diagnosis $diagnosis) => $diagnosis->recordSyncChange('upsert'));
    }

    public function disease(): BelongsTo
    {
        return $this->belongsTo(Disease::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function review(): HasOne
    {
        return $this->hasOne(DiagnosisReview::class);
    }

    public function datasetCandidate(): HasOne
    {
        return $this->hasOne(DatasetCandidate::class);
    }

    public function hasActiveResearchConsent(): bool
    {
        return $this->research_consented_at !== null && $this->research_consent_withdrawn_at === null;
    }

    public function recordSyncChange(string $changeType): void
    {
        DiagnosisSyncChange::query()->create([
            'user_id' => $this->user_id,
            'diagnosis_id' => $this->id,
            'sync_uuid' => $this->sync_uuid,
            'change_type' => $changeType,
        ]);
    }
}
