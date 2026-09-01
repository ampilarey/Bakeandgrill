<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The subtotal a manual discount was authorised against.
 *
 * Without it the discount is a bare number of laari with no memory of the cart
 * it was agreed on, so when the cart shrinks there is nothing to measure the
 * old figure against. A MVR 200 discount on a MVR 600 ticket stayed MVR 200
 * after four of six items came off, and the MVR 100 that remained went out
 * free. Owner audit, 2026-09-01.
 *
 * Storing the basis lets the recalculation keep the *share* that was actually
 * approved — the approval SMS quotes a percentage, so the percentage is the
 * thing the manager agreed to — rather than a laari figure that outlives the
 * order it was sized for.
 *
 * Null on every existing row, and null means "no basis recorded": those keep
 * the old behaviour rather than being re-scaled against a subtotal nobody
 * measured.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('orders') || Schema::hasColumn('orders', 'manual_discount_subtotal_laar')) {
            return;
        }

        Schema::table('orders', function (Blueprint $table) {
            $table->integer('manual_discount_subtotal_laar')
                ->nullable()
                ->after('manual_discount_laar');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('orders') || !Schema::hasColumn('orders', 'manual_discount_subtotal_laar')) {
            return;
        }

        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn('manual_discount_subtotal_laar');
        });
    }
};
