<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('diseases', function (Blueprint $table) {
            $table->string('model_class_key')->nullable()->unique()->after('slug');
            $table->json('alternative_names')->nullable()->after('name');
            $table->string('causal_agent')->nullable()->after('scientific_name');
            $table->string('pathogen_type')->nullable()->after('causal_agent');
            $table->text('short_description')->nullable()->after('pathogen_type');
            $table->text('farmer_summary')->nullable()->after('short_description');
            $table->string('curative_status')->default('unclear_evidence')->after('farmer_summary');
            $table->string('verification_status')->default('draft')->index()->after('curative_status');
            $table->string('evidence_level')->default('limited')->after('verification_status');
            $table->boolean('is_verified')->default(false)->index()->after('evidence_level');
            $table->timestamp('last_reviewed_at')->nullable()->after('is_verified');
            $table->timestamp('regulatory_checked_at')->nullable()->after('last_reviewed_at');
            $table->timestamp('verified_at')->nullable()->after('regulatory_checked_at');
            $table->foreignId('verified_by')->nullable()->after('verified_at')->constrained('users')->nullOnDelete();
            $table->text('image_only_limitations')->nullable()->after('verified_by');
            $table->text('professional_referral')->nullable()->after('image_only_limitations');
        });

        Schema::create('disease_symptoms', function (Blueprint $table) {
            $table->id();
            $table->foreignId('disease_id')->constrained()->cascadeOnDelete();
            $table->string('stage');
            $table->string('plant_part');
            $table->text('symptom');
            $table->boolean('visible_in_leaf_image')->default(false);
            $table->text('farmer_friendly_text')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('disease_management', function (Blueprint $table) {
            $table->id();
            $table->foreignId('disease_id')->constrained()->cascadeOnDelete();
            $table->string('category')->index();
            $table->text('recommendation');
            $table->text('farmer_friendly_text')->nullable();
            $table->string('evidence_strength')->default('limited');
            $table->boolean('requires_professional')->default(false);
            $table->boolean('regulatory_check_required')->default(false);
            $table->timestamp('regulatory_checked_at')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('research_sources', function (Blueprint $table) {
            $table->id();
            $table->text('title');
            $table->text('authors');
            $table->unsignedSmallInteger('year')->nullable()->index();
            $table->string('journal_or_institution');
            $table->string('source_type')->index();
            $table->string('volume')->nullable();
            $table->string('issue')->nullable();
            $table->string('pages')->nullable();
            $table->string('doi')->nullable()->unique();
            $table->text('reference_url')->nullable();
            $table->string('country_or_region')->nullable();
            $table->boolean('peer_reviewed')->default(false)->index();
            $table->boolean('philippines_specific')->default(false)->index();
            $table->date('publication_date')->nullable();
            $table->timestamp('accessed_at')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('disease_evidence', function (Blueprint $table) {
            $table->id();
            $table->foreignId('disease_id')->constrained()->cascadeOnDelete();
            $table->foreignId('source_id')->constrained('research_sources')->cascadeOnDelete();
            $table->string('claim_type')->index();
            $table->text('claim_text');
            $table->string('evidence_strength')->default('limited');
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('pesticide_regulatory_checks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('disease_management_id')->constrained('disease_management')->cascadeOnDelete();
            $table->foreignId('source_id')->constrained('research_sources')->restrictOnDelete();
            $table->string('product_name');
            $table->string('active_ingredient')->nullable();
            $table->string('permitted_crop');
            $table->string('permitted_target');
            $table->string('registration_number')->nullable();
            $table->string('registration_status')->index();
            $table->date('registration_expires_at')->nullable();
            $table->text('approved_label_url')->nullable();
            $table->timestamp('checked_at');
            $table->foreignId('checked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::table('diagnoses', function (Blueprint $table) {
            $table->boolean('is_simulated')->default(true)->index()->after('source');
            $table->string('expert_review_status')->nullable()->after('diagnosed_at');
            $table->string('expert_verified_label')->nullable()->after('expert_review_status');
            $table->text('expert_notes')->nullable()->after('expert_verified_label');
            $table->foreignId('expert_id')->nullable()->after('expert_notes')->constrained('users')->nullOnDelete();
            $table->timestamp('expert_reviewed_at')->nullable()->after('expert_id');
        });
    }

    public function down(): void
    {
        Schema::table('diagnoses', function (Blueprint $table) {
            $table->dropConstrainedForeignId('expert_id');
            $table->dropColumn(['is_simulated', 'expert_review_status', 'expert_verified_label', 'expert_notes', 'expert_reviewed_at']);
        });
        Schema::dropIfExists('disease_evidence');
        Schema::dropIfExists('pesticide_regulatory_checks');
        Schema::dropIfExists('research_sources');
        Schema::dropIfExists('disease_management');
        Schema::dropIfExists('disease_symptoms');
        Schema::table('diseases', function (Blueprint $table) {
            $table->dropConstrainedForeignId('verified_by');
            $table->dropUnique(['model_class_key']);
            $table->dropColumn([
                'model_class_key', 'alternative_names', 'causal_agent', 'pathogen_type', 'short_description',
                'farmer_summary', 'curative_status', 'verification_status', 'evidence_level', 'is_verified',
                'last_reviewed_at', 'regulatory_checked_at', 'verified_at', 'image_only_limitations', 'professional_referral',
            ]);
        });
    }
};
