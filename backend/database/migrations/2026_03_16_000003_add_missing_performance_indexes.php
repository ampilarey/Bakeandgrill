<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds indexes on frequently-queried FK and filter columns that were missing.
 * Uses raw SHOW INDEX queries (MySQL-safe) to skip already-existing indexes.
 */
return new class extends Migration
{
    /**
     * List of [table, column(s), index_name] tuples to add.
     * Multi-column indexes use an array for column.
     */
    private array $indexes = [
        ['refunds',                   'order_id',                     'refunds_order_id_index'],
        ['refunds',                   'user_id',                      'refunds_user_id_index'],
        ['cash_movements',            'shift_id',                     'cash_movements_shift_id_index'],
        ['cash_movements',            'user_id',                      'cash_movements_user_id_index'],
        ['supplier_ratings',          'supplier_id',                  'supplier_ratings_supplier_id_index'],
        ['supplier_ratings',          'purchase_id',                  'supplier_ratings_purchase_id_index'],
        ['expenses',                  'user_id',                      'expenses_user_id_index'],
        ['expenses',                  'supplier_id',                  'expenses_supplier_id_index'],
        ['sms_campaign_recipients',   'customer_id',                  'sms_campaign_recipients_customer_id_index'],
    ];

    public function up(): void
    {
        foreach ($this->indexes as [$table, $column, $indexName]) {
            if (!Schema::hasTable($table)) {
                continue;
            }

            $exists = collect(DB::select(
                "SHOW INDEX FROM `{$table}` WHERE Key_name = ?",
                [$indexName]
            ))->isNotEmpty();

            if ($exists) {
                continue;
            }

            Schema::table($table, function (Blueprint $bp) use ($column, $indexName): void {
                $bp->index($column, $indexName);
            });
        }
    }

    public function down(): void
    {
        foreach ($this->indexes as [$table, , $indexName]) {
            if (!Schema::hasTable($table)) {
                continue;
            }

            $exists = collect(DB::select(
                "SHOW INDEX FROM `{$table}` WHERE Key_name = ?",
                [$indexName]
            ))->isNotEmpty();

            if (!$exists) {
                continue;
            }

            Schema::table($table, function (Blueprint $bp) use ($indexName): void {
                $bp->dropIndex($indexName);
            });
        }
    }
};
