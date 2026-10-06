<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('research_images', function (Blueprint $table) {
            $table->id();
            // Snapshots deliberately have no cascade back to an account or scan.
            $table->unsignedBigInteger('source_user_id')->nullable()->index();
            $table->unsignedBigInteger('source_diagnosis_id')->index();
            $table->unsignedBigInteger('source_candidate_id')->index();
            $table->string('image_path')->nullable();
            $table->char('sha256', 64);
            $table->string('verified_label');
            $table->string('consent_version', 50);
            $table->timestamp('consented_at');
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at');
            $table->foreignId('revoked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('revoked_at')->nullable()->index();
            $table->string('revocation_reason', 500)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('research_images');
    }
};
