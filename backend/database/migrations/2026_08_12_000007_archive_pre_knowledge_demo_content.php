<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('diseases')->whereNull('model_class_key')->update([
            'verification_status' => 'archived',
            'is_verified' => false,
            'verified_at' => null,
            'verified_by' => null,
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        // Intentionally do not promote legacy unverified content on rollback.
    }
};
