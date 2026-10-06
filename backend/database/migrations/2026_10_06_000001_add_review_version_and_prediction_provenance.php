<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('diagnosis_reviews', function (Blueprint $table) {
            $table->unsignedInteger('version')->default(0);
        });
        Schema::table('diagnosis_review_revisions', function (Blueprint $table) {
            $table->string('revision_reason', 500)->nullable();
        });
        Schema::table('diagnoses', function (Blueprint $table) {
            // Existing and on-device submissions cannot be attested by the API.
            $table->boolean('prediction_verified')->default(false)->index();
        });
    }

    public function down(): void
    {
        Schema::table('diagnoses', fn (Blueprint $table) => $table->dropColumn('prediction_verified'));
        Schema::table('diagnosis_review_revisions', fn (Blueprint $table) => $table->dropColumn('revision_reason'));
        Schema::table('diagnosis_reviews', fn (Blueprint $table) => $table->dropColumn('version'));
    }
};
