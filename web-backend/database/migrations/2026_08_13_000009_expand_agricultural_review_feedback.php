<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('diagnoses', function (Blueprint $table) {
            $table->text('farmer_notes')->nullable()->after('gradcam_path');
        });

        Schema::table('diagnosis_reviews', function (Blueprint $table) {
            $table->string('image_quality')->nullable()->after('verified_label');
            $table->json('next_steps')->nullable()->after('image_quality');
        });

        Schema::create('dataset_candidates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('diagnosis_id')->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('proposed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status')->default('pending')->index();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('review_notes')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dataset_candidates');
        Schema::table('diagnosis_reviews', function (Blueprint $table) {
            $table->dropColumn(['image_quality', 'next_steps']);
        });
        Schema::table('diagnoses', function (Blueprint $table) {
            $table->dropColumn('farmer_notes');
        });
    }
};
