<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Poster templates (docs/POSTER_THEMES_HANDOFF.md): a poster or a saved
 * template may be drawn on one of the ready-made designs instead of a
 * layout and a mood. The design's key goes here; the words and photo
 * choices go in the existing `slots` JSON, keyed t1… and p1….
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('posters', function (Blueprint $table) {
            $table->string('theme', 64)->nullable()->after('layout');
        });
        Schema::table('poster_templates', function (Blueprint $table) {
            $table->string('theme', 64)->nullable()->after('layout');
        });
    }

    public function down(): void
    {
        Schema::table('posters', function (Blueprint $table) {
            $table->dropColumn('theme');
        });
        Schema::table('poster_templates', function (Blueprint $table) {
            $table->dropColumn('theme');
        });
    }
};
