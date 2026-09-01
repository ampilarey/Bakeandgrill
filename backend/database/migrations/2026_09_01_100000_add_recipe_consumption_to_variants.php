<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Shared stock across sizes.
 *
 * Owner, 2026-09-01: "We serve beetle leaf with nuts, if i bring 50 leafs,
 * some customers may order full and others half. I have entered the item as
 * variant. Variant one is full, 2 is half. But actually quantity of the items
 * are combined. 1 full is equal to 2 half."
 *
 * `variants.stock_qty` is an independent counter per variant, so it cannot
 * express one pool drawn on at different rates. The recipe/inventory chain
 * already IS a shared pool — it just deducted the same amount whichever size
 * sold, because recipes hang off the item. `consumption_factor` is how much of
 * the item's recipe one of this variant uses: full = 1, half = 0.5.
 *
 * `recipes.limits_availability` is the opt-in that lets the pool 86 the dish.
 * It defaults to false so existing recipes keep behaving exactly as before —
 * an ingredient count that nobody keeps current must not silently take an item
 * off the menu.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('variants', 'consumption_factor')) {
            Schema::table('variants', function (Blueprint $table): void {
                $table->decimal('consumption_factor', 8, 3)
                    ->default(1)
                    ->after('low_stock_threshold');
            });
        }

        if (!Schema::hasColumn('recipes', 'limits_availability')) {
            Schema::table('recipes', function (Blueprint $table): void {
                $table->boolean('limits_availability')
                    ->default(false)
                    ->after('yield_quantity');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('recipes', 'limits_availability')) {
            Schema::table('recipes', function (Blueprint $table): void {
                $table->dropColumn('limits_availability');
            });
        }

        if (Schema::hasColumn('variants', 'consumption_factor')) {
            Schema::table('variants', function (Blueprint $table): void {
                $table->dropColumn('consumption_factor');
            });
        }
    }
};
