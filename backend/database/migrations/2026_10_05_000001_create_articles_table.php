<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Farmer-readable library articles. Every article cites research sources
        // through article_research_source, the same references the admin manages.
        Schema::create('articles', function (Blueprint $table) {
            $table->id();
            $table->string('slug')->unique();
            $table->string('title');
            // A model class key (healthy, sigatoka, ...), or null for general farm topics.
            $table->string('disease_key')->nullable()->index();
            $table->string('topic')->index();
            $table->string('language', 8)->default('en');
            $table->text('summary');
            $table->longText('body');
            $table->string('authors', 500);
            $table->string('status')->default('draft')->index();
            $table->timestamp('published_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('article_research_source', function (Blueprint $table) {
            $table->id();
            $table->foreignId('article_id')->constrained()->cascadeOnDelete();
            $table->foreignId('research_source_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->unique(['article_id', 'research_source_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('article_research_source');
        Schema::dropIfExists('articles');
    }
};
