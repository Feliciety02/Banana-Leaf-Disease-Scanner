<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('diagnoses', function (Blueprint $table) {
            $table->timestamp('research_consented_at')->nullable()->after('farmer_notes');
            $table->string('research_consent_version', 50)->nullable()->after('research_consented_at');
            $table->timestamp('research_consent_withdrawn_at')->nullable()->after('research_consent_version');
        });
    }

    public function down(): void
    {
        Schema::table('diagnoses', function (Blueprint $table) {
            $table->dropColumn([
                'research_consented_at',
                'research_consent_version',
                'research_consent_withdrawn_at',
            ]);
        });
    }
};
