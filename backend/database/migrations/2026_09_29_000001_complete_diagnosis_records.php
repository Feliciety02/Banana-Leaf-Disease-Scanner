<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const LEGACY_REVIEW_COLUMNS = ['expert_review_status', 'expert_verified_label', 'expert_notes', 'expert_reviewed_at'];

    public function up(): void
    {
        Schema::table('diagnoses', function (Blueprint $table) {
            $table->json('class_probabilities')->nullable()->after('confidence');
            $table->json('model_comparison')->nullable()->after('class_probabilities');
        });

        // Mobile scans are produced by the bundled on-device model, never by a
        // simulator; earlier versions flagged them from the server's AI mode.
        DB::table('diagnoses')->where('source', 'mobile')->update(['is_simulated' => false]);

        // Reviews now live only in diagnosis_reviews. Carry over any review that
        // was recorded in the legacy per-diagnosis columns, then drop them.
        if (Schema::hasColumn('diagnoses', 'expert_review_status')) {
            DB::table('diagnoses')
                ->whereNotNull('expert_review_status')
                ->whereNotExists(fn ($query) => $query->select(DB::raw(1))->from('diagnosis_reviews')->whereColumn('diagnosis_reviews.diagnosis_id', 'diagnoses.id'))
                ->orderBy('id')
                ->chunkById(500, function ($diagnoses) {
                    DB::table('diagnosis_reviews')->insert($diagnoses->map(fn ($diagnosis) => [
                        'diagnosis_id' => $diagnosis->id,
                        'expert_id' => $diagnosis->expert_id,
                        'review_status' => $diagnosis->expert_review_status,
                        'verified_label' => $diagnosis->expert_verified_label,
                        'notes' => $diagnosis->expert_notes,
                        'reviewed_at' => $diagnosis->expert_reviewed_at,
                        'created_at' => $diagnosis->expert_reviewed_at ?? now(),
                        'updated_at' => now(),
                    ])->all());
                });

            Schema::table('diagnoses', function (Blueprint $table) {
                $table->dropConstrainedForeignId('expert_id');
                $table->dropColumn(self::LEGACY_REVIEW_COLUMNS);
            });
        }
    }

    public function down(): void
    {
        Schema::table('diagnoses', function (Blueprint $table) {
            $table->string('expert_review_status')->nullable()->after('diagnosed_at');
            $table->string('expert_verified_label')->nullable()->after('expert_review_status');
            $table->text('expert_notes')->nullable()->after('expert_verified_label');
            $table->foreignId('expert_id')->nullable()->after('expert_notes')->constrained('users')->nullOnDelete();
            $table->timestamp('expert_reviewed_at')->nullable()->after('expert_id');
            $table->dropColumn(['class_probabilities', 'model_comparison']);
        });
    }
};
