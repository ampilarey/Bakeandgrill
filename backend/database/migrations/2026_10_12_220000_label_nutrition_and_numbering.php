<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Labels, 2026-10-12 (owner: "All" of the advanced features, round C): a
 * nutrition panel per 100 g. Each inventory ingredient carries its values
 * per 100 g; a recipe's panel is worked out from them; an item prints it
 * when switched on, a custom label prints its typed line.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_items', function (Blueprint $table): void {
            // {kcal, fat, sat_fat, carbs, sugars, protein, salt} per 100 g, as typed on Labels → Settings.
            $table->json('nutrition')->nullable()->after('is_label_ingredient');
        });
        Schema::table('items', function (Blueprint $table): void {
            $table->boolean('label_show_nutrition')->default(false)->after('label_net_weight');
        });
        Schema::table('custom_labels', function (Blueprint $table): void {
            $table->string('label_nutrition', 200)->nullable()->after('label_allergens');
        });
    }

    public function down(): void
    {
        Schema::table('custom_labels', fn (Blueprint $table) => $table->dropColumn('label_nutrition'));
        Schema::table('items', fn (Blueprint $table) => $table->dropColumn('label_show_nutrition'));
        Schema::table('inventory_items', fn (Blueprint $table) => $table->dropColumn('nutrition'));
    }
};
