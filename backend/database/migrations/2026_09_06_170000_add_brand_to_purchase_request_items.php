<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The brand a shop-run item was bought as.
 *
 * Purchase orders record brand per line; the buying list never did, so a
 * runner who bought Anchor ghee instead of Rainbow was invisible to the
 * brand price comparison — the half of the shopping that happens off a PO
 * simply did not exist to it. Owner, 2026-09-06: the point of the comparison
 * is "different brands and different sizes", wherever they were bought.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchase_request_items', function (Blueprint $table) {
            $table->string('brand', 100)->nullable()->after('supplier_name_text');
        });
    }

    public function down(): void
    {
        Schema::table('purchase_request_items', function (Blueprint $table) {
            $table->dropColumn('brand');
        });
    }
};
