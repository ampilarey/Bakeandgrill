<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where to send a supplier's money.
 *
 * Owner, 2026-09-08: "add supplier acc number option". An account number on
 * its own does not pay anybody here — two banks issue them and the name on
 * the account is often the shopkeeper's rather than the shop's — so the bank
 * and the account name come with it. All optional: plenty of suppliers are
 * paid in cash and never need any of this.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            $table->string('bank_name', 100)->nullable()->after('payment_terms');
            $table->string('bank_account_name', 255)->nullable()->after('bank_name');
            $table->string('bank_account_number', 64)->nullable()->after('bank_account_name');
        });
    }

    public function down(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            $table->dropColumn(['bank_name', 'bank_account_name', 'bank_account_number']);
        });
    }
};
