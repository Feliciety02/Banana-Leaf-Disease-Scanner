<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('terms_accepted_at')->nullable();
            $table->string('terms_version', 50)->nullable();
            $table->timestamp('research_photo_consent_at')->nullable();
            $table->string('research_photo_consent_version', 50)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn([
            'terms_accepted_at', 'terms_version', 'research_photo_consent_at', 'research_photo_consent_version',
        ]));
    }
};
