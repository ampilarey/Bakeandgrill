<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * FIX 1 — refund drawer cash.
 *
 * Refund rows historically stored `amount` only. When a refund reversed a
 * non-cash tender (credit account, gift card, wallet, card/BML), the entire
 * refund amount still hit the shift's expected-cash-out calc, because
 * expectedCashFor summed ROUND(amount*100) for every non-rejected refund.
 *
 * `drawer_cash_out_laar` records the true "money that leaves the drawer" for
 * each refund. NULL preserves legacy behaviour (fallback to ROUND(amount*100))
 * so historical refunds don't shift their reconciliation numbers.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('refunds', function (Blueprint $table): void {
            $table->bigInteger('drawer_cash_out_laar')->nullable()->after('amount');
        });
    }

    public function down(): void
    {
        Schema::table('refunds', function (Blueprint $table): void {
            $table->dropColumn('drawer_cash_out_laar');
        });
    }
};
