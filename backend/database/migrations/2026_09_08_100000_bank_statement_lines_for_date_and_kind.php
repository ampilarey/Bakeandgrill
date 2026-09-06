<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Owner, 2026-09-07, after sharing two real BML exports: a POS credit on the
 * statement names the day the sales were made, and a transfer credit names
 * the moment the customer sent it. So the line no longer has to be guessed
 * onto a day — it carries the day it was for.
 *
 *   for_date      the sales day this credit settles (POS) or the day the
 *                 customer transferred (transfer). Null for formats that do
 *                 not say, which fall back to oldest-day-first.
 *   kind          'pos' | 'transfer' | 'other' as the bank labelled it.
 *                 Only POS credits settle card & QR takings; anything else
 *                 in that account (the owner topping it up) is set aside.
 *   counterparty  who sent a transfer, for matching against the customer.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bank_statement_lines', function (Blueprint $table): void {
            $table->date('for_date')->nullable()->index()->after('txn_date');
            $table->string('kind', 16)->nullable()->after('for_date');
            $table->string('counterparty', 120)->nullable()->after('reference');
        });
    }

    public function down(): void
    {
        Schema::table('bank_statement_lines', function (Blueprint $table): void {
            $table->dropColumn(['for_date', 'kind', 'counterparty']);
        });
    }
};
