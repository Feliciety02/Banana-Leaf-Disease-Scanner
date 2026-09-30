<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // diagnosis_reviews holds only the current assessment; every completed
        // assessment that is later replaced is preserved here for audit.
        Schema::create('diagnosis_review_revisions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('diagnosis_review_id')->constrained()->cascadeOnDelete();
            $table->foreignId('expert_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('review_status');
            $table->string('verified_label')->nullable();
            $table->string('image_quality')->nullable();
            $table->json('next_steps')->nullable();
            $table->text('notes')->nullable();
            $table->boolean('requires_field_inspection')->default(false);
            $table->timestamp('reviewed_at')->nullable();
            $table->foreignId('replaced_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('diagnosis_review_revisions');
    }
};
