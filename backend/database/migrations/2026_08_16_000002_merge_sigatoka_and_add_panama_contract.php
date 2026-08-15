<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $legacyLabels = ['black-sigatoka', 'yellow-sigatoka'];

        if (Schema::hasTable('diseases')) {
            $sigatoka = DB::table('diseases')
                ->where(fn ($query) => $query->where('model_class_key', 'sigatoka')->orWhere('slug', 'sigatoka'))
                ->first();
            $legacyDiseases = DB::table('diseases')
                ->whereIn('model_class_key', $legacyLabels)
                ->orWhereIn('slug', $legacyLabels)
                ->orderByRaw("CASE WHEN model_class_key = 'black-sigatoka' OR slug = 'black-sigatoka' THEN 0 ELSE 1 END")
                ->get();

            if (! $sigatoka && $legacyDiseases->isNotEmpty()) {
                $promoted = $legacyDiseases->shift();
                DB::table('diseases')->where('id', $promoted->id)->update([
                    'slug' => 'sigatoka',
                    'model_class_key' => 'sigatoka',
                    'name' => 'Sigatoka Leaf Spot',
                    'updated_at' => now(),
                ]);
                $sigatoka = DB::table('diseases')->where('id', $promoted->id)->first();
            }

            if ($sigatoka) {
                foreach ($legacyDiseases as $legacyDisease) {
                    if (Schema::hasTable('diagnoses')) {
                        DB::table('diagnoses')->where('disease_id', $legacyDisease->id)->update(['disease_id' => $sigatoka->id]);
                    }
                    DB::table('diseases')->where('id', $legacyDisease->id)->delete();
                }
            }

            $panamaExists = DB::table('diseases')
                ->where(fn ($query) => $query->where('model_class_key', 'panama-disease')->orWhere('slug', 'panama-disease'))
                ->exists();
            if (! $panamaExists) {
                DB::table('diseases')->insert([
                    'slug' => 'panama-disease',
                    'model_class_key' => 'panama-disease',
                    'name' => 'Panama Disease',
                    'description' => 'Scientific and image-visible symptom content is pending source review.',
                    'symptoms' => json_encode([]),
                    'management' => 'Disease-specific management guidance is pending source and agricultural review.',
                    'verification_status' => 'draft',
                    'evidence_level' => 'limited',
                    'is_verified' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }

        if (Schema::hasTable('diagnoses')) {
            DB::table('diagnoses')->whereIn('predicted_class', $legacyLabels)->update(['predicted_class' => 'sigatoka']);
            if (Schema::hasColumn('diagnoses', 'expert_verified_label')) {
                DB::table('diagnoses')->whereIn('expert_verified_label', $legacyLabels)->update(['expert_verified_label' => 'sigatoka']);
            }
        }
        if (Schema::hasTable('diagnosis_reviews')) {
            DB::table('diagnosis_reviews')->whereIn('verified_label', $legacyLabels)->update(['verified_label' => 'sigatoka']);
        }
    }

    public function down(): void
    {
        throw new RuntimeException(
            'This taxonomy migration cannot be reversed safely because merged Sigatoka records cannot be split back into Black and Yellow labels.',
        );
    }
};
