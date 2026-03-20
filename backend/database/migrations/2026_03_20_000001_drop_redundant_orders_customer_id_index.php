<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The orders table has two overlapping indexes on customer_id:
 *   1. Composite (customer_id, created_at) — added in the create-orders migration
 *   2. Single-column customer_id — added by add_reporting_indexes migration
 *
 * MySQL can use the composite index for prefix queries on customer_id alone,
 * so the single-column index is redundant and wastes write overhead.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('orders')) {
            return;
        }

        $singleExists = collect(DB::select(
            "SHOW INDEX FROM `orders` WHERE Key_name = ?",
            ['orders_customer_id_index']
        ))->isNotEmpty();

        if ($singleExists) {
            Schema::table('orders', function (Blueprint $table): void {
                $table->dropIndex('orders_customer_id_index');
            });
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('orders')) {
            return;
        }

        $exists = collect(DB::select(
            "SHOW INDEX FROM `orders` WHERE Key_name = ?",
            ['orders_customer_id_index']
        ))->isNotEmpty();

        if (!$exists) {
            Schema::table('orders', function (Blueprint $table): void {
                $table->index('customer_id', 'orders_customer_id_index');
            });
        }
    }
};
