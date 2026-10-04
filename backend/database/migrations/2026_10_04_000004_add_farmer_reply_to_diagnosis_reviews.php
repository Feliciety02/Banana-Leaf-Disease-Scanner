<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The farmer's answer when reopening a completed review. The original
        // reason stays on the diagnosis; earlier rounds stay on the revisions.
        Schema::table('diagnosis_reviews', function (Blueprint $table) {
            $table->text('farmer_reply')->nullable()->after('farmer_message');
        });
        Schema::table('diagnosis_review_revisions', function (Blueprint $table) {
            $table->text('farmer_reply')->nullable()->after('farmer_message');
        });
    }

    public function down(): void
    {
        Schema::table('diagnosis_reviews', fn (Blueprint $table) => $table->dropColumn('farmer_reply'));
        Schema::table('diagnosis_review_revisions', fn (Blueprint $table) => $table->dropColumn('farmer_reply'));
    }
};
