<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('diagnosis_reviews', function (Blueprint $table) {
            // Null until the farmer opens the completed review; reset when it changes.
            $table->timestamp('farmer_seen_at')->nullable()->after('reviewed_at');
        });
    }

    public function down(): void
    {
        Schema::table('diagnosis_reviews', function (Blueprint $table) {
            $table->dropColumn('farmer_seen_at');
        });
    }
};
