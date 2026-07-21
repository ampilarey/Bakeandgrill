<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * FIX 11 — record cash `tendered_amount` (what the cashier actually
 * received) and the derived `change_given` separately from the
 * `amount` that lands in the drawer. Both nullable and backward-
 * compatible: existing rows (and clients that don't send the field)
 * behave exactly as before.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table): void {
            $table->decimal('tendered_amount', 12, 2)->nullable()->after('amount');
            $table->decimal('change_given', 12, 2)->nullable()->after('tendered_amount');
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table): void {
            $table->dropColumn(['tendered_amount', 'change_given']);
        });
    }
};
