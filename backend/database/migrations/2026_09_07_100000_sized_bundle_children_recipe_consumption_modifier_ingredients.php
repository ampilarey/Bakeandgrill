<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Menu-item stock audit, 2026-09-07 (owner: "Fix all").
 *
 *  - A bundle or platter can name WHICH SIZE of a sized dish it contains.
 *    Until now `combo_items` and `platter_group_items` carried only an item
 *    id, so "Coke" in a bundle was no size at all: no size on the ticket, no
 *    size-level stock movement, cheapest size in the contents price.
 *
 *  - A recipe says WHEN its ingredients leave the store: when the dish is
 *    sold (the default, and what every recipe did) or when the kitchen
 *    records producing it. Production batches consume ingredients only for
 *    the second kind, so a dish cannot take its flour twice.
 *
 *  - A modifier ("extra cheese") can point at an ingredient and say how much
 *    of it one modifier uses, so add-ons move stock like everything else.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('combo_items', function (Blueprint $table): void {
            $table->foreignId('variant_id')->nullable()->after('item_id')
                ->constrained('variants')->nullOnDelete();
        });

        Schema::table('platter_group_items', function (Blueprint $table): void {
            $table->foreignId('variant_id')->nullable()->after('item_id')
                ->constrained('variants')->nullOnDelete();
        });

        Schema::table('recipes', function (Blueprint $table): void {
            // 'sale' | 'production'
            $table->string('consumed_at', 16)->default('sale')->after('limits_availability');
        });

        Schema::table('modifiers', function (Blueprint $table): void {
            $table->foreignId('inventory_item_id')->nullable()->after('price')
                ->constrained('inventory_items')->nullOnDelete();
            $table->decimal('ingredient_quantity', 12, 4)->nullable()->after('inventory_item_id');
            $table->string('ingredient_unit', 32)->nullable()->after('ingredient_quantity');
        });
    }

    public function down(): void
    {
        Schema::table('modifiers', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('inventory_item_id');
            $table->dropColumn(['ingredient_quantity', 'ingredient_unit']);
        });
        Schema::table('recipes', function (Blueprint $table): void {
            $table->dropColumn('consumed_at');
        });
        Schema::table('platter_group_items', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('variant_id');
        });
        Schema::table('combo_items', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('variant_id');
        });
    }
};
