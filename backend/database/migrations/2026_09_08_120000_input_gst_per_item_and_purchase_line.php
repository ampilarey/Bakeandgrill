<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Owner, 2026-09-07: "I remember I told you no GST return, but some items
 * are eligible for GST return."
 *
 * Until now a purchase either claimed input GST as a whole or not at all,
 * and the café's answer was "not at all" — so the price typed on every
 * line was the money gone for good. Now GST is a fact about the item:
 *
 *   inventory_items.gst_rate_bp   the rate this item is bought with and
 *                                 claimable at (800 = 8%); null = none.
 *                                 Pre-fills every purchase line for it.
 *   purchase_items.gst_rate_bp    the rate on this line, as it was bought.
 *   purchase_items.gst_laar       the GST inside the line's typed price,
 *                                 so the purchase can add up its claim.
 *
 * The typed price stays the money handed over, GST included — the owner's
 * rule. What changes is that the GST part of it comes back once a tax
 * invoice is on file, so it is no longer cost.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_items', function (Blueprint $table): void {
            $table->unsignedSmallInteger('gst_rate_bp')->nullable()->after('unit_cost');
        });

        Schema::table('purchase_items', function (Blueprint $table): void {
            $table->unsignedSmallInteger('gst_rate_bp')->nullable()->after('total_cost');
            $table->bigInteger('gst_laar')->default(0)->after('gst_rate_bp');
        });
    }

    public function down(): void
    {
        Schema::table('purchase_items', function (Blueprint $table): void {
            $table->dropColumn(['gst_rate_bp', 'gst_laar']);
        });
        Schema::table('inventory_items', function (Blueprint $table): void {
            $table->dropColumn('gst_rate_bp');
        });
    }
};
