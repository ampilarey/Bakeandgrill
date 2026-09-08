<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * More than one number for a supplier.
 *
 * Owner, 2026-09-08: "add option to add more than one contact number." A shop
 * is a mobile, a landline and whoever is on the counter today.
 *
 * `phone` stays the main one and keeps its meaning: it is what an invoice is
 * sent to and what the finance report shows, and neither should start
 * guessing between several. The rest live here, in order.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            $table->json('extra_phones')->nullable()->after('phone');
        });
    }

    public function down(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            $table->dropColumn('extra_phones');
        });
    }
};
