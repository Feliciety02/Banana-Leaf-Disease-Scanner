<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Optional, farmer-chosen scan location, rounded on the device to about 110 m.
        Schema::table('diagnoses', function (Blueprint $table) {
            $table->decimal('latitude', 8, 3)->nullable()->after('farmer_notes');
            $table->decimal('longitude', 8, 3)->nullable()->after('latitude');
        });
    }

    public function down(): void
    {
        Schema::table('diagnoses', fn (Blueprint $table) => $table->dropColumn(['latitude', 'longitude']));
    }
};
