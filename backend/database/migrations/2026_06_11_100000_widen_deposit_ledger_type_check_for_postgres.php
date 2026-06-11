<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 2026_05_23_100000_extend_customer_deposit_ledger widened the `type` enum for
 * MySQL only. On PostgreSQL the original enum() became a CHECK constraint that
 * still allows just the first four values, so payouts, transfers, reversals,
 * and split adjustments fail with a 23514 check violation.
 */
return new class extends Migration
{
    private const TYPES = [
        'top_up', 'usage', 'refund', 'adjustment',
        'adjustment_add', 'adjustment_deduct', 'transfer_to_credit', 'reversal', 'payout',
    ];

    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'pgsql') {
            return;
        }

        $allowed = "'" . implode("', '", self::TYPES) . "'";

        DB::statement('ALTER TABLE customer_deposit_ledger DROP CONSTRAINT IF EXISTS customer_deposit_ledger_type_check');
        DB::statement("ALTER TABLE customer_deposit_ledger ADD CONSTRAINT customer_deposit_ledger_type_check CHECK (type::text IN ({$allowed}))");
    }

    public function down(): void
    {
        // Intentionally left as-is: narrowing the constraint back would fail once
        // rows with the newer types exist, and the widened list is a superset.
    }
};
