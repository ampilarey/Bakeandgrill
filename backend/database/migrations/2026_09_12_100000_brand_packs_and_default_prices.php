<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Packs that belong to a brand, and what that pack normally costs.
 *
 * Owner, 2026-09-12: "options to add different brands and packaging options to
 * each brand and default price to each brand. And when the default amount is
 * changed in manual po, the latest values automatically update in the system."
 *
 * Until now a pack belonged to the item, so every brand of ghee shared one
 * list: you could not say Amul comes in a 1 kg tin and Nestlé in a 500 g jar.
 * And nothing anywhere held a price — the buying screen could only offer what
 * the last purchase happened to be.
 *
 * Two changes:
 *
 *  - A pack may now name a brand. `brand_key` is the folded form (lower case,
 *    trimmed, runs of space collapsed) that InventoryBrandPhoto::keyFor()
 *    already produces, so "Amul", "amul" and "AMUL " are one brand here as
 *    they are there. Empty string means the pack belongs to the item rather
 *    than to any one brand, which is what every existing pack becomes — so
 *    nothing that works today stops working.
 *
 *  - A pack carries `default_unit_cost`: what a manual purchase order should
 *    open at. It is written by hand in the item editor and then kept honest
 *    by purchasing — entering a different price on a PO line updates it, with
 *    `default_cost_updated_at` recording when, so a price set months ago is
 *    visibly a price set months ago.
 *
 * The unique index moves with it. "Tin" was unique per item; it is now unique
 * per item per brand, because Amul's tin and Nestlé's tin are two different
 * boxes that happen to share a word.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_purchase_units', function (Blueprint $table) {
            // Stored alongside the key so a screen can show the brand as
            // somebody typed it rather than as the lookup folds it.
            $table->string('brand')->nullable()->after('inventory_item_id');
            $table->string('brand_key', 190)->default('')->after('brand');
            $table->decimal('default_unit_cost', 12, 2)->nullable()->after('base_units');
            $table->timestamp('default_cost_updated_at')->nullable()->after('default_unit_cost');
        });

        Schema::table('inventory_purchase_units', function (Blueprint $table) {
            $table->dropUnique(['inventory_item_id', 'name']);
        });

        Schema::table('inventory_purchase_units', function (Blueprint $table) {
            $table->unique(['inventory_item_id', 'brand_key', 'name'], 'purchase_units_item_brand_name_unique');
            $table->index(['inventory_item_id', 'brand_key'], 'purchase_units_item_brand_index');
        });
    }

    public function down(): void
    {
        /*
         * Reversing collapses brands back into one list per item, and two
         * brands that both call their box "Tin" would then collide on the
         * restored unique index. The brand-specific ones go; the shared ones
         * — which is everything that existed before this migration — stay.
         */
        Illuminate\Support\Facades\DB::table('inventory_purchase_units')
            ->where('brand_key', '!=', '')
            ->delete();

        Schema::table('inventory_purchase_units', function (Blueprint $table) {
            $table->dropUnique('purchase_units_item_brand_name_unique');
            $table->dropIndex('purchase_units_item_brand_index');
        });

        Schema::table('inventory_purchase_units', function (Blueprint $table) {
            $table->dropColumn(['brand', 'brand_key', 'default_unit_cost', 'default_cost_updated_at']);
        });

        Schema::table('inventory_purchase_units', function (Blueprint $table) {
            $table->unique(['inventory_item_id', 'name']);
        });
    }
};
