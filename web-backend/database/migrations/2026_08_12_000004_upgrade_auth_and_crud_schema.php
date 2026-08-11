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

        Schema::table('diseases', function (Blueprint $table) {
            if (! Schema::hasColumn('diseases', 'prevention')) {
                $table->text('prevention')->nullable();
            }
            if (! Schema::hasColumn('diseases', 'image_path')) {
                $table->string('image_path')->nullable();
            }
        });

        Schema::table('diagnoses', function (Blueprint $table) {
            if (! Schema::hasColumn('diagnoses', 'user_id')) {
                $table->foreignId('user_id')->nullable()->after('id')->constrained()->cascadeOnDelete();
            }
            if (! Schema::hasColumn('diagnoses', 'sync_uuid')) {
                $table->uuid('sync_uuid')->nullable()->unique();
            }
            if (! Schema::hasColumn('diagnoses', 'sync_status')) {
                $table->string('sync_status')->nullable();
            }
        });

        $diseaseColumn = collect(Schema::getColumns('diagnoses'))->firstWhere('name', 'disease_id');
        if (! ($diseaseColumn['nullable'] ?? false)) {
            Schema::table('diagnoses', fn (Blueprint $table) => $table->dropForeign(['disease_id']));
            Schema::table('diagnoses', fn (Blueprint $table) => $table->foreignId('disease_id')->nullable()->change());
            Schema::table('diagnoses', fn (Blueprint $table) => $table->foreign('disease_id')->references('id')->on('diseases')->cascadeOnUpdate()->nullOnDelete());
        }
    }

    public function down(): void {}
};
