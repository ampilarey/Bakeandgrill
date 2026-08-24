<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * One wallet reversal per refund, enforced by the database.
 *
 * `reverseUsageForOrderRefund` guards against double-crediting a customer's
 * deposit by checking for an existing (refund_id, type='reversal') row — but
 * the check runs outside the transaction with nothing behind it, so two
 * concurrent reversals could both pass it. Deposit *usage* has exactly the
 * same check-then-insert shape and is safe only because
 * `unique(payment_id)` sits underneath it. This gives reversals the same
 * footing.
 *
 * It cannot happen today: refund approval serialises under a row lock and
 * fires the event once. That makes this defence in depth — the guard stops
 * depending on discipline in a different file.
 *
 * Duplicates are collapsed first (keeping the earliest of each pair) so the
 * index can be created on real data. `refund_id` is nullable and NULLs are
 * distinct in a unique index on both MySQL and SQLite, so the many rows with
 * no refund — top-ups, payouts, usage — are unaffected.
 */
return new class extends Migration
{
    private const INDEX = 'customer_deposit_ledger_refund_reversal_unique';

    public function up(): void
    {
        if (!Schema::hasTable('customer_deposit_ledger')
            || !Schema::hasColumn('customer_deposit_ledger', 'refund_id')) {
            return;
        }

        $this->collapseDuplicateReversals();

        Schema::table('customer_deposit_ledger', function (Blueprint $table) {
            $table->unique(['refund_id', 'type'], self::INDEX);
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('customer_deposit_ledger')) {
            return;
        }

        Schema::table('customer_deposit_ledger', function (Blueprint $table) {
            $table->dropUnique(self::INDEX);
        });
    }

    /**
     * Keep the lowest id per (refund_id, type) and delete the rest.
     *
     * The balance those extra rows created is NOT unwound — that would be a
     * silent correction to a customer's money, which belongs in a considered
     * adjustment with an audit trail, not in a schema migration. In practice
     * there should be nothing here to collapse.
     */
    private function collapseDuplicateReversals(): void
    {
        $duplicates = DB::table('customer_deposit_ledger')
            ->select('refund_id', 'type')
            ->whereNotNull('refund_id')
            ->groupBy('refund_id', 'type')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        foreach ($duplicates as $duplicate) {
            $keepId = DB::table('customer_deposit_ledger')
                ->where('refund_id', $duplicate->refund_id)
                ->where('type', $duplicate->type)
                ->min('id');

            DB::table('customer_deposit_ledger')
                ->where('refund_id', $duplicate->refund_id)
                ->where('type', $duplicate->type)
                ->where('id', '!=', $keepId)
                ->delete();
        }
    }
};
