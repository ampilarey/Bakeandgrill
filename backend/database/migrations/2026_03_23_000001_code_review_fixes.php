<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Code-review remediation migration.
 *
 * C-2  — Add `received_quantity` column to `purchase_items`
 * C-3  — Add foreign-key constraint on `purchases.supplier_id`
 * H-7  — Add indexes on date columns used in report queries
 * M-7  — (invoices.token already has a unique index from its own migration)
 * M-16 — Add composite index on `sms_logs(customer_id, created_at)`
 */
return new class extends Migration
{
    public function up(): void
    {
        // ── C-2: received_quantity column ─────────────────────────────────────
        if (Schema::hasTable('purchase_items') && !Schema::hasColumn('purchase_items', 'received_quantity')) {
            Schema::table('purchase_items', function (Blueprint $table) {
                $table->decimal('received_quantity', 10, 3)->default(0)->after('quantity');
            });
        }

        // ── C-3: Foreign key on purchases.supplier_id ─────────────────────────
        // Nullify any supplier_id values that point to non-existent suppliers
        // before adding the FK constraint so the migration doesn't fail on dirty data.
        if (Schema::hasTable('purchases') && Schema::hasTable('suppliers')) {
            DB::table('purchases')
                ->whereNotNull('supplier_id')
                ->whereNotIn('supplier_id', DB::table('suppliers')->pluck('id'))
                ->update(['supplier_id' => null]);

            Schema::table('purchases', function (Blueprint $table) {
                $table->foreign('supplier_id')
                    ->references('id')
                    ->on('suppliers')
                    ->nullOnDelete();
            });
        }

        // ── H-7: Missing indexes on date columns used in reports ──────────────
        if (Schema::hasTable('orders')) {
            Schema::table('orders', function (Blueprint $table) {
                if (!$this->indexExists('orders', 'orders_paid_at_index')) {
                    $table->index('paid_at');
                }
                if (!$this->indexExists('orders', 'orders_completed_at_index')) {
                    $table->index('completed_at');
                }
            });
        }

        if (Schema::hasTable('customers')) {
            Schema::table('customers', function (Blueprint $table) {
                if (!$this->indexExists('customers', 'customers_created_at_index')) {
                    $table->index('created_at');
                }
            });
        }

        if (Schema::hasTable('invoices')) {
            Schema::table('invoices', function (Blueprint $table) {
                if (!$this->indexExists('invoices', 'invoices_created_at_index')) {
                    $table->index('created_at');
                }
                // Note: invoices.token already has a unique constraint (unique index)
                // from migration 2026_03_22_100001_add_token_to_invoices_table.php
            });
        }

        // ── M-16: Composite index on sms_logs(customer_id, created_at) ────────
        if (Schema::hasTable('sms_logs')) {
            Schema::table('sms_logs', function (Blueprint $table) {
                if (!$this->indexExists('sms_logs', 'sms_logs_customer_id_created_at_index')) {
                    $table->index(['customer_id', 'created_at']);
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('purchase_items') && Schema::hasColumn('purchase_items', 'received_quantity')) {
            Schema::table('purchase_items', function (Blueprint $table) {
                $table->dropColumn('received_quantity');
            });
        }

        if (Schema::hasTable('purchases')) {
            Schema::table('purchases', function (Blueprint $table) {
                $table->dropForeign(['supplier_id']);
            });
        }

        if (Schema::hasTable('orders')) {
            Schema::table('orders', function (Blueprint $table) {
                $table->dropIndex('orders_paid_at_index');
                $table->dropIndex('orders_completed_at_index');
            });
        }

        if (Schema::hasTable('customers')) {
            Schema::table('customers', function (Blueprint $table) {
                $table->dropIndex('customers_created_at_index');
            });
        }

        if (Schema::hasTable('invoices')) {
            Schema::table('invoices', function (Blueprint $table) {
                $table->dropIndex('invoices_created_at_index');
            });
        }

        if (Schema::hasTable('sms_logs')) {
            Schema::table('sms_logs', function (Blueprint $table) {
                $table->dropIndex('sms_logs_customer_id_created_at_index');
            });
        }
    }

    /** Check whether a named index already exists on a table. */
    private function indexExists(string $table, string $indexName): bool
    {
        $indexes = DB::select("SHOW INDEX FROM `{$table}` WHERE Key_name = ?", [$indexName]);

        return count($indexes) > 0;
    }
};
