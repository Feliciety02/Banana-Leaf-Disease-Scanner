<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'role')) {
            Schema::table('users', fn (Blueprint $table) => $table->string('role')->default('user')->index());
        }
        if (! Schema::hasColumn('mobile_diagnoses', 'user_id')) {
            Schema::table('mobile_diagnoses', fn (Blueprint $table) => $table->foreignId('user_id')->nullable()->after('id')->constrained()->cascadeOnDelete());
        }
    }

    public function down(): void {}
};
