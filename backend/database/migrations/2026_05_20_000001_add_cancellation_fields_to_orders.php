<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds three columns to support manual order cancellation (void) from
 * the POS Active Orders panel:
 *
 *   cancellation_reason  Short free-form text the cashier types in the
 *                        void confirm dialog ("Customer changed mind",
 *                        "Wrong order", "Walked out", etc.). Cap at 255
 *                        to keep it report-friendly. Nullable because
 *                        legacy cancellations (cron-cancelled stale
 *                        payment_pending orders) never had a reason and
 *                        we don't want to retro-fill them with garbage.
 *
 *   cancelled_at         When the cancellation actually happened. Useful
 *                        for "void rate per hour" reports separate from
 *                        general updated_at churn.
 *
 *   cancelled_by         user_id of the staff member who hit Void.
 *                        Required for accountability — when a manager
 *                        reviews the day's voids the cashier is named
 *                        on every row.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('cancellation_reason', 255)
                ->nullable()
                ->after('notes');

            $table->timestamp('cancelled_at')
                ->nullable()
                ->after('cancellation_reason');

            $table->foreignId('cancelled_by')
                ->nullable()
                ->after('cancelled_at')
                ->constrained('users')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropForeign(['cancelled_by']);
            $table->dropColumn(['cancellation_reason', 'cancelled_at', 'cancelled_by']);
        });
    }
};
