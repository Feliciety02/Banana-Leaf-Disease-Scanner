<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Reviewer notes stay internal; this is the part written for the farmer.
        Schema::table('diagnosis_reviews', function (Blueprint $table) {
            $table->text('farmer_message')->nullable()->after('notes');
        });
        Schema::table('diagnosis_review_revisions', function (Blueprint $table) {
            $table->text('farmer_message')->nullable()->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('diagnosis_reviews', fn (Blueprint $table) => $table->dropColumn('farmer_message'));
        Schema::table('diagnosis_review_revisions', fn (Blueprint $table) => $table->dropColumn('farmer_message'));
    }
};
