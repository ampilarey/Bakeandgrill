<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Badges (round 9 of the usability work, owner, 2026-10-13: "badges you drop
 * on: Halal, Spicy, New, Gluten-free, drawn in the brand style"). A product
 * keeps up to four badge keys (`label_badges`, JSON; App\Domains\Labels\
 * LabelBadges), printed as rust pills under the name on every size with room.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->json('label_badges')->nullable()->after('label_layout');
        });
        Schema::table('custom_labels', function (Blueprint $table) {
            $table->json('label_badges')->nullable()->after('label_layout');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('label_badges');
        });
        Schema::table('custom_labels', function (Blueprint $table) {
            $table->dropColumn('label_badges');
        });
    }
};
