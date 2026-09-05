<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How you buy a thing, as opposed to how you count it.
 *
 * Owner, 2026-09-05: "when i buy 1 egg case, its 7 tray, each tray 30 egg, so
 * total 210 egg, automatically calculate unit price for each egg". Stock is
 * counted in eggs. Nobody buys an egg.
 *
 * `unit_conversions` cannot answer this. It is keyed on the unit names alone,
 * so there is one global "case → piece" factor: eggs at 210 and a case of
 * bottles at 24 would overwrite each other. A pack size belongs to the item,
 * not to the word on the box, so it lives here.
 *
 * `base_units` is how many of the item's own unit are inside one pack. It is
 * always resolved to the base unit even when somebody defines it as a nest of
 * other packs, so a purchase never has to walk a chain to price a line.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_purchase_units', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inventory_item_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            // Six decimals so a pack that divides awkwardly (a 1/3 kg bag) is
            // still exact enough that the per-unit price does not drift.
            $table->decimal('base_units', 14, 6);
            $table->timestamps();

            // One "Tray" per item. Two would make the picker ambiguous and the
            // stored snapshot meaningless.
            $table->unique(['inventory_item_id', 'name']);
        });

        Schema::table('purchase_items', function (Blueprint $table) {
            // A snapshot, not a foreign key. Editing "Case" from 210 to 200 next
            // year must not silently restate what a purchase last year bought.
            $table->string('pack_name')->nullable()->after('inventory_item_id');
            $table->decimal('pack_size', 14, 6)->nullable()->after('pack_name');
            $table->decimal('pack_quantity', 14, 6)->nullable()->after('pack_size');

            /*
             * Two decimals cannot hold a divided price. A case of 210 eggs at
             * MVR 415 is 1.976190 each, and storing 1.98 restates the case as
             * MVR 415.80 — money the shop never spent. `total_cost` stays at
             * two decimals because it is what was actually paid; this column
             * is the derived per-unit figure, so it gets the room to be right.
             * `stock_movements.unit_cost` was widened for the same reason.
             */
            $table->decimal('unit_cost', 14, 6)->default(0)->change();
        });
    }

    public function down(): void
    {
        Schema::table('purchase_items', function (Blueprint $table) {
            $table->dropColumn(['pack_name', 'pack_size', 'pack_quantity']);
            $table->decimal('unit_cost', 10, 2)->default(0)->change();
        });

        Schema::dropIfExists('inventory_purchase_units');
    }
};
