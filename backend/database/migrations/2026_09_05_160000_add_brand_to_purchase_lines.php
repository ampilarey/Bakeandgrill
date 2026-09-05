<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which brand this particular purchase was.
 *
 * Owner, 2026-09-05: "egg has many brand i mean company logo. And different
 * days different brands has different prices. So need to record i bought today
 * egg brand a. Yesterday b".
 *
 * The brand belongs to the purchase, not to the item. An egg is an egg on the
 * shelf whichever box it came out of, so the stock count stays one number and
 * recipes keep pointing at one thing. What changes brand to brand is the
 * price, and price is a property of the buying.
 *
 * A column on `inventory_items` would be the wrong shape: with 5 trays of one
 * brand and 3 of another in a single row, whatever that column said would be
 * false. Here each purchase says what it was, and nothing has to be reconciled.
 *
 * `supplier_price_history` gets it too, since that is the table every price
 * comparison reads — without it the brand would be recorded but invisible to
 * the only question it is worth asking, which is what each one costs.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchase_items', function (Blueprint $table) {
            $table->string('brand')->nullable()->after('pack_quantity');
        });

        Schema::table('supplier_price_history', function (Blueprint $table) {
            $table->string('brand')->nullable()->after('inventory_item_id');
            // "What has this item cost by brand lately" is the query this is
            // for, so it is worth an index rather than a scan per item.
            $table->index(['inventory_item_id', 'brand']);
        });
    }

    public function down(): void
    {
        Schema::table('supplier_price_history', function (Blueprint $table) {
            $table->dropIndex(['inventory_item_id', 'brand']);
            $table->dropColumn('brand');
        });

        Schema::table('purchase_items', function (Blueprint $table) {
            $table->dropColumn('brand');
        });
    }
};
