<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mobile_diagnoses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('client_id')->unique();
            $table->string('device_id')->index();
            $table->foreignId('disease_id')->constrained()->cascadeOnUpdate()->restrictOnDelete();
            $table->string('predicted_class');
            $table->decimal('confidence', 5, 2);
            $table->string('model_version');
            $table->unsignedInteger('inference_time_ms');
            $table->timestamp('diagnosed_at')->index();
            $table->timestamp('received_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mobile_diagnoses');
    }
};
