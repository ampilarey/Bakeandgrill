<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add indexes that dramatically speed up:
 *   - SSE stream queries (updated_at on orders)
 *   - KDS/orders listing (status + updated_at composite)
 *   - SMS log de-duplication lookups (idempotency_key)
 *   - Analytics date-range queries (created_at on order_items)
 */
return new class extends Migration
{
    public function up(): void
    {
        // SSE OrderStreamProvider: WHERE updated_at > ? ORDER BY updated_at, id
        if (Schema::hasTable('orders') && ! $this->hasIndex('orders', 'orders_updated_at_id_index')) {
            Schema::table('orders', function (Blueprint $table): void {
                $table->index(['updated_at', 'id'], 'orders_updated_at_id_index');
            });
        }

        // KDS: WHERE status IN (...) ORDER BY created_at — composite is faster than two separate
        if (Schema::hasTable('orders') && ! $this->hasIndex('orders', 'orders_status_created_at_index')) {
            Schema::table('orders', function (Blueprint $table): void {
                $table->index(['status', 'created_at'], 'orders_status_created_at_index');
            });
        }

        // SmsLog de-duplication: WHERE idempotency_key = ?
        if (Schema::hasTable('sms_logs') && ! $this->hasIndex('sms_logs', 'sms_logs_idempotency_key_index')) {
            Schema::table('sms_logs', function (Blueprint $table): void {
                $table->index('idempotency_key', 'sms_logs_idempotency_key_index');
            });
        }

        // Analytics/report date-range scans on order_items
        if (Schema::hasTable('order_items') && ! $this->hasIndex('order_items', 'order_items_created_at_index')) {
            Schema::table('order_items', function (Blueprint $table): void {
                $table->index('created_at', 'order_items_created_at_index');
            });
        }
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropIndexIfExists('orders_updated_at_id_index');
            $table->dropIndexIfExists('orders_status_created_at_index');
        });

        Schema::table('sms_logs', function (Blueprint $table): void {
            $table->dropIndexIfExists('sms_logs_idempotency_key_index');
        });

        Schema::table('order_items', function (Blueprint $table): void {
            $table->dropIndexIfExists('order_items_created_at_index');
        });
    }

    private function hasIndex(string $table, string $indexName): bool
    {
        return collect(Schema::getIndexes($table))
            ->contains(fn ($idx) => $idx['name'] === $indexName);
    }
};
