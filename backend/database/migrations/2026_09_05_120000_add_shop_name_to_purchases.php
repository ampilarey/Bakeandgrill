<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where it was bought, when that is not a supplier on file.
 *
 * `supplier_id` covers the accounts the shop actually has. Most buying is not
 * that: it is somebody walking to the shop on the corner for two crates and a
 * bag of ice. Forcing a supplier record for every corner shop means either a
 * register full of one-purchase suppliers, or — what happens in practice — the
 * purchase never gets entered at all.
 *
 * Purchase request lines have carried `supplier_name_text` since they were
 * built, and the buying screen has always asked for a shop name. This brings
 * the owner's own purchase entry into line with the one the staff already use.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchases', function (Blueprint $table) {
            $table->string('supplier_name_text')->nullable()->after('supplier_id');
        });
    }

    public function down(): void
    {
        Schema::table('purchases', function (Blueprint $table) {
            $table->dropColumn('supplier_name_text');
        });
    }
};
