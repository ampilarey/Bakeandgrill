<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A barcode on the pack itself.
 *
 * The 100 ml tin and the 500 ml tin of the same ghee carry different EAN
 * codes on the shelf, and an item has only one barcode field — so a scan
 * could never say which size arrived. With the code on the pack, scanning a
 * tin at receiving or at a stock count counts the right number of ml.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_purchase_units', function (Blueprint $table) {
            $table->string('barcode', 64)->nullable()->after('base_units');
            $table->index('barcode');
        });
    }

    public function down(): void
    {
        Schema::table('inventory_purchase_units', function (Blueprint $table) {
            $table->dropIndex(['barcode']);
            $table->dropColumn('barcode');
        });
    }
};
