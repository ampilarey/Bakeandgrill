<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Medium & Low code-review remediation migration.
 *
 * M-6  — Change items.stock_quantity / low_stock_threshold from integer to decimal (fractional stock)
 * M-10 — Add deleted_at to order_items so soft-deleted orders cascade to items
 * M-12 — Add standalone index on webhook_logs.gateway_event_id (composite alone insufficient)
 * M-13 — Add (target_type, target_id) index on promotion_targets for reverse lookups
 */
return new class extends Migration
{
    public function up(): void
    {
        // ── M-6: Stock quantities to decimal ─────────────────────────────────
        if (Schema::hasTable('items')) {
            Schema::table('items', function (Blueprint $table) {
                if (Schema::hasColumn('items', 'stock_quantity')) {
                    $table->decimal('stock_quantity', 10, 3)->default(0)->change();
                }
                if (Schema::hasColumn('items', 'low_stock_threshold')) {
                    $table->decimal('low_stock_threshold', 10, 3)->default(5)->change();
                }
            });
        }

        // ── M-10: Soft-delete cascade for order_items ─────────────────────────
        if (Schema::hasTable('order_items') && !Schema::hasColumn('order_items', 'deleted_at')) {
            Schema::table('order_items', function (Blueprint $table) {
                $table->softDeletes();
            });
        }

        // ── M-12: Standalone index on webhook_logs.gateway_event_id ──────────
        if (Schema::hasTable('webhook_logs') && Schema::hasColumn('webhook_logs', 'gateway_event_id')) {
            if (!Schema::hasIndex('webhook_logs', 'webhook_logs_gateway_event_id_index')) {
                Schema::table('webhook_logs', function (Blueprint $table) {
                    $table->index('gateway_event_id');
                });
            }
        }

        // ── M-13: Reverse lookup index on promotion_targets ──────────────────
        if (Schema::hasTable('promotion_targets')) {
            if (!Schema::hasIndex('promotion_targets', 'promotion_targets_target_type_target_id_index')) {
                Schema::table('promotion_targets', function (Blueprint $table) {
                    $table->index(['target_type', 'target_id']);
                });
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('items')) {
            Schema::table('items', function (Blueprint $table) {
                if (Schema::hasColumn('items', 'stock_quantity')) {
                    $table->integer('stock_quantity')->default(0)->change();
                }
                if (Schema::hasColumn('items', 'low_stock_threshold')) {
                    $table->integer('low_stock_threshold')->default(5)->change();
                }
            });
        }

        if (Schema::hasTable('order_items') && Schema::hasColumn('order_items', 'deleted_at')) {
            Schema::table('order_items', function (Blueprint $table) {
                $table->dropSoftDeletes();
            });
        }

        if (Schema::hasTable('webhook_logs')) {
            Schema::table('webhook_logs', function (Blueprint $table) {
                $table->dropIndex('webhook_logs_gateway_event_id_index');
            });
        }

        if (Schema::hasTable('promotion_targets')) {
            Schema::table('promotion_targets', function (Blueprint $table) {
                $table->dropIndex('promotion_targets_target_type_target_id_index');
            });
        }
    }
};
