<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Which reviewer is working on a scan right now. Kept apart from the
        // diagnosis so claiming a case never triggers a farmer sync.
        Schema::create('review_claims', function (Blueprint $table) {
            $table->id();
            $table->foreignId('diagnosis_id')->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('expires_at')->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('review_claims');
    }
};
