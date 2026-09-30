<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $diseases = DB::table('diseases')->whereNotNull('model_class_key')->get(['id', 'slug', 'model_class_key']);

        // The slug now has to match the model class key. Align older records
        // unless another record already owns that slug.
        foreach ($diseases as $disease) {
            if ($disease->slug !== $disease->model_class_key
                && ! DB::table('diseases')->where('slug', $disease->model_class_key)->exists()) {
                DB::table('diseases')->where('id', $disease->id)->update(['slug' => $disease->model_class_key]);
            }
        }

        // Diagnoses link to the knowledge record of their predicted class.
        // Earlier API writes could leave the link empty or pointing elsewhere.
        foreach ($diseases as $disease) {
            DB::table('diagnoses')
                ->where('predicted_class', $disease->model_class_key)
                ->where(fn ($query) => $query->whereNull('disease_id')->orWhere('disease_id', '!=', $disease->id))
                ->update(['disease_id' => $disease->id]);
        }

        // A deleted scan has no image left to review, so its open nomination is
        // discarded. Approved candidates stay as the audit record of approval.
        DB::table('dataset_candidates')
            ->where('status', '!=', 'approved')
            ->whereIn('diagnosis_id', DB::table('diagnoses')->whereNotNull('deleted_at')->select('id'))
            ->delete();
    }

    public function down(): void
    {
        // Data reconciliation only; there is no earlier state worth restoring.
    }
};
