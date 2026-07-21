<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * FIX 4 — cash_movements.category.
 *
 * expectedCashFor treats every cash_in / cash_out identically so the
 * drawer balance is right regardless. What was missing was a tag so
 * X / Z / shift summary payloads can BREAK OUT credit-repayment cash
 * from generic paid-in / paid-out lines without having to text-match
 * the free-form `reason`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cash_movements', function (Blueprint $table): void {
            $table->string('category', 32)->nullable()->after('type');
            $table->index('category');
        });
    }

    public function down(): void
    {
        Schema::table('cash_movements', function (Blueprint $table): void {
            $table->dropIndex(['category']);
            $table->dropColumn('category');
        });
    }
};
