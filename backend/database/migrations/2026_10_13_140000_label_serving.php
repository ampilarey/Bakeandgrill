<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Nutrition per serving (round 15 of the labels usability work, owner,
 * 2026-10-13: "nutrition per serving beside per 100 g"): the serving size
 * of a menu item, in g (or ml for a drink), printed as a second column.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table): void {
            $table->decimal('label_serving_g', 7, 1)->nullable()->after('label_nutrition_per');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table): void {
            $table->dropColumn('label_serving_g');
        });
    }
};
