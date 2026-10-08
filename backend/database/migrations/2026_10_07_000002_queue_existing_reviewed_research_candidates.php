<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Older consented reviews should appear in the same manual decision
        // queue as reviews completed after this release. No image is copied.
        DB::table('diagnoses as diagnoses')
            ->join('diagnosis_reviews as reviews', 'reviews.diagnosis_id', '=', 'diagnoses.id')
            ->leftJoin('dataset_candidates as candidates', 'candidates.diagnosis_id', '=', 'diagnoses.id')
            ->whereNull('candidates.id')
            ->whereNull('diagnoses.deleted_at')
            ->whereNotNull('diagnoses.image_path')
            ->whereNotNull('diagnoses.research_consented_at')
            ->whereNull('diagnoses.research_consent_withdrawn_at')
            ->where('diagnoses.research_consent_version', config('banana.research_consent_version'))
            ->where('reviews.review_status', '!=', 'pending')
            ->select('diagnoses.id as diagnosis_id', 'reviews.expert_id')
            ->chunkById(200, function ($rows): void {
                $now = now();
                DB::table('dataset_candidates')->insertOrIgnore($rows->map(fn ($row) => [
                    'diagnosis_id' => $row->diagnosis_id,
                    'proposed_by' => $row->expert_id,
                    'status' => 'pending',
                    'created_at' => $now,
                    'updated_at' => $now,
                ])->all());
            }, 'diagnoses.id', 'diagnosis_id');
    }

    public function down(): void
    {
        // Keep staff decisions and their audit trail if this migration is rolled back.
    }
};
