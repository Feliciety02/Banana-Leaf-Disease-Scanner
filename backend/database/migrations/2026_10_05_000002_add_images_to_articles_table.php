<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Photos shown in an article, each with its caption, credit and license.
        // The body places them with a "[[image:<file>]]" line.
        Schema::table('articles', function (Blueprint $table) {
            $table->json('images')->nullable()->after('body');
        });
    }

    public function down(): void
    {
        Schema::table('articles', function (Blueprint $table) {
            $table->dropColumn('images');
        });
    }
};
