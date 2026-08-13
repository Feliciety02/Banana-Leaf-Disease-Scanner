<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('diagnoses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('disease_id')->nullable()->constrained()->cascadeOnUpdate()->nullOnDelete();
            $table->string('predicted_class')->index();
            $table->decimal('confidence', 5, 2);
            $table->string('image_path')->nullable();
            $table->string('gradcam_path')->nullable();
            $table->string('model_version')->nullable();
            $table->unsignedInteger('inference_time_ms')->nullable();
            $table->string('source')->default('web');
            $table->uuid('sync_uuid')->nullable()->unique();
            $table->string('sync_status')->nullable();
            $table->timestamp('diagnosed_at')->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('diagnoses');
    }
};
