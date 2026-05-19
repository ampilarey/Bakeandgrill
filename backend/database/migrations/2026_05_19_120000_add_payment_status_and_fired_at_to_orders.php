<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Adds two columns that make the phone-call pickup workflow possible:
 *
 *   payment_status  Tells POS / KDS / reports whether an order is fully
 *                   paid, partially paid, or completely unpaid. Today we
 *                   only have order.status which conflates "what is the
 *                   kitchen doing" with "has it been paid for" — both
 *                   correlated for in-store sales but a phone pickup
 *                   order can be cooking-but-unpaid or ready-but-unpaid.
 *
 *   fired_at        Timestamp of when the order was first sent to the
 *                   kitchen. NULL = parked in Open Tickets only. Set on
 *                   either initial create-with-fire OR a later call to
 *                   POST /orders/{id}/fire-to-kitchen. We can't reuse
 *                   created_at because a held ticket can sit for an
 *                   hour before the cashier fires it.
 *
 * Backfill: existing rows are paid if status is paid/completed/delivered/refunded;
 * everything else is treated as unpaid. fired_at is backfilled to created_at
 * for any non-held / non-pending-without-payment row so existing KDS history
 * and Sales Reports don't look broken.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            // Use string instead of enum so we can add new states later
            // without an ALTER (Laravel/MySQL enum mutations are
            // painful). Indexed because we'll filter Open Tickets by
            // "unpaid only" in the cashier UI.
            $table->string('payment_status', 20)
                ->default('unpaid')
                ->after('status')
                ->index();

            $table->timestamp('fired_at')
                ->nullable()
                ->after('payment_status');
        });

        // Backfill payment_status. Anything in a terminal-paid state is paid;
        // everything else (pending/held/cancelled/etc.) is treated as unpaid.
        // This keeps Sales Reports identical to today — they already filter by
        // order.status, not payment_status.
        DB::table('orders')
            ->whereIn('status', ['paid', 'completed', 'delivered', 'refunded'])
            ->update(['payment_status' => 'paid']);

        // Backfill fired_at: any order that ever reached the kitchen (i.e.
        // wasn't held when this migration ran) is considered fired at
        // creation time. Held tickets correctly stay NULL — they were
        // never sent.
        DB::table('orders')
            ->where('status', '!=', 'held')
            ->update(['fired_at' => DB::raw('created_at')]);
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['payment_status']);
            $table->dropColumn(['payment_status', 'fired_at']);
        });
    }
};
