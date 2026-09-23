<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A "look" per group and per screen (owner, 2026-09-23: "setting different
 * layout for the tv in admin app"). A JSON bag — preset, columns, rows,
 * thumbnails, showcase cap, card style, category filter, Dhivehi-first —
 * merged group → screen by the resolver. Null means "as the playlist's
 * auto-menu entry says", which is what every existing screen has today.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('signage_groups', function (Blueprint $table) {
            $table->json('layout')->nullable()->after('theme');
        });
        Schema::table('signage_screens', function (Blueprint $table) {
            $table->json('layout')->nullable()->after('overrides');
        });
    }

    public function down(): void
    {
        Schema::table('signage_groups', function (Blueprint $table) {
            $table->dropColumn('layout');
        });
        Schema::table('signage_screens', function (Blueprint $table) {
            $table->dropColumn('layout');
        });
    }
};
