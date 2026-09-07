<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('diagnoses', function (Blueprint $table) {
            $table->softDeletes()->index();
        });

        Schema::create('diagnosis_sync_changes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('diagnosis_id')->index();
            $table->uuid('sync_uuid')->nullable()->index();
            $table->string('change_type', 16);
            $table->timestamps();
            $table->index(['user_id', 'id'], 'diagnosis_sync_changes_user_cursor');
        });

        DB::table('diagnoses')
            ->select(['id', 'user_id', 'sync_uuid', 'created_at', 'updated_at'])
            ->orderBy('id')
            ->chunkById(500, function ($diagnoses) {
                DB::table('diagnosis_sync_changes')->insert($diagnoses->map(fn ($diagnosis) => [
                    'user_id' => $diagnosis->user_id,
                    'diagnosis_id' => $diagnosis->id,
                    'sync_uuid' => $diagnosis->sync_uuid,
                    'change_type' => 'upsert',
                    'created_at' => $diagnosis->created_at ?? now(),
                    'updated_at' => $diagnosis->updated_at ?? now(),
                ])->all());
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('diagnosis_sync_changes');

        Schema::table('diagnoses', fn (Blueprint $table) => $table->dropSoftDeletes());
    }
};
