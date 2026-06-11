<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Two PostgreSQL compatibility fixes surfaced by the Postgres CI parity job:
 *
 * 1. 2026_04_16_120000 seeds menu_groups / kitchen_menu_state with explicit
 *    id => 1, which does not advance Postgres identity sequences — the next
 *    INSERT collides with "duplicate key violates menu_groups_pkey".
 *
 * 2. gift_cards.status was created as enum('active','expired','depleted');
 *    cancelled cards violate the resulting check constraint on Postgres
 *    (and the enum on MySQL), so widen both.
 */
return new class extends Migration
{
    private const GIFT_CARD_STATUSES = ['active', 'expired', 'depleted', 'cancelled'];

    public function up(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'pgsql') {
            foreach (['menu_groups', 'kitchen_menu_state'] as $table) {
                DB::statement(
                    "SELECT setval(pg_get_serial_sequence('{$table}', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM {$table}), 1))",
                );
            }

            $allowed = "'" . implode("', '", self::GIFT_CARD_STATUSES) . "'";
            DB::statement('ALTER TABLE gift_cards DROP CONSTRAINT IF EXISTS gift_cards_status_check');
            DB::statement("ALTER TABLE gift_cards ADD CONSTRAINT gift_cards_status_check CHECK (status::text IN ({$allowed}))");
        }

        if ($driver === 'mysql') {
            $allowed = "'" . implode("', '", self::GIFT_CARD_STATUSES) . "'";
            DB::statement("ALTER TABLE gift_cards MODIFY COLUMN status ENUM({$allowed}) NOT NULL DEFAULT 'active'");
        }
    }

    public function down(): void
    {
        // Sequences need no rollback; narrowing the status list back would fail
        // once cancelled rows exist, so the widened set is kept.
    }
};
