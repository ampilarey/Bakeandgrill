<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Widen gift_card_transactions.type to include 'void' — used when a purchased
 * gift card is voided on refund (or on admin-cancel of a spent card) so the
 * unused/residual balance is written off in the ledger.
 *
 * SQLite has no ENUM; the string column already accepts arbitrary values.
 */
return new class extends Migration
{
    private const TYPES = ['load', 'redeem', 'refund', 'void'];

    public function up(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            $allowed = "'" . implode("', '", self::TYPES) . "'";
            DB::statement("ALTER TABLE gift_card_transactions MODIFY COLUMN type ENUM({$allowed}) NOT NULL");
        }

        if ($driver === 'pgsql') {
            $allowed = "'" . implode("', '", self::TYPES) . "'";
            DB::statement('ALTER TABLE gift_card_transactions DROP CONSTRAINT IF EXISTS gift_card_transactions_type_check');
            DB::statement("ALTER TABLE gift_card_transactions ADD CONSTRAINT gift_card_transactions_type_check CHECK (type::text IN ({$allowed}))");
        }
    }

    public function down(): void
    {
        // Narrowing the type list back would fail if void rows exist. Keep widened.
    }
};
