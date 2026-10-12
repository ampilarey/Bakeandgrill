<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Labels, 2026-10-12 (owner: "build all" of the audit's recommendations):
 *
 *   - a price and a barcode on the sticker, so a shop can scan and sell the
 *     pack at its own till (items: the menu price unless a label price is
 *     typed, shown only when switched on; custom labels: a typed price)
 *   - a net weight beside the quantity ("250 g")
 *   - a custom label's allergens (an item's come from its Details tab),
 *     printed bold in the ingredients and as a "Contains …" note
 *   - a pinned (favourite) saved label, which leads Print again
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->decimal('label_price', 10, 2)->nullable()->after('label_pack_unit');
            $table->boolean('label_show_price')->default(false)->after('label_price');
            $table->string('label_barcode', 20)->nullable()->after('label_show_price');
            $table->string('label_net_weight', 20)->nullable()->after('label_barcode');
        });
        Schema::table('custom_labels', function (Blueprint $table) {
            $table->decimal('label_price', 10, 2)->nullable()->after('label_pack_unit');
            $table->string('label_barcode', 20)->nullable()->after('label_price');
            $table->string('label_net_weight', 20)->nullable()->after('label_barcode');
            $table->string('label_allergens', 200)->nullable()->after('label_net_weight');
        });
        Schema::table('label_jobs', function (Blueprint $table) {
            $table->boolean('pinned')->default(false)->after('name');
            $table->index(['pinned', 'last_printed_at']);
        });
    }

    public function down(): void
    {
        Schema::table('label_jobs', function (Blueprint $table) {
            $table->dropIndex(['pinned', 'last_printed_at']);
            $table->dropColumn('pinned');
        });
        Schema::table('custom_labels', function (Blueprint $table) {
            $table->dropColumn(['label_price', 'label_barcode', 'label_net_weight', 'label_allergens']);
        });
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn(['label_price', 'label_show_price', 'label_barcode', 'label_net_weight']);
        });
    }
};
