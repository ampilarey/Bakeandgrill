<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stage E — shop sales-report submissions (claims only; staff still reconcile).
 *
 * Idempotent for environments that already applied objects without a migrations row.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('trade_deliveries')
            && ! Schema::hasColumn('trade_deliveries', 'reported_by_customer_id')) {
            Schema::table('trade_deliveries', function (Blueprint $table) {
                $table->foreignId('reported_by_customer_id')
                    ->nullable()
                    ->after('reported_by')
                    ->constrained('customers')
                    ->nullOnDelete();
            });
        }

        // Auto-generated index name is 65 chars (MySQL max 64) — use a short name.
        $deliveryCreatedIdx = 'tsrs_delivery_created_idx';

        if (! Schema::hasTable('trade_sales_report_submissions')) {
            Schema::create('trade_sales_report_submissions', function (Blueprint $table) use ($deliveryCreatedIdx) {
                $table->id();
                $table->foreignId('trade_delivery_id')->constrained('trade_deliveries')->cascadeOnDelete();
                $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
                $table->string('idempotency_key')->unique();
                $table->json('lines_json');
                $table->timestamps();

                $table->index(['trade_delivery_id', 'created_at'], $deliveryCreatedIdx);
            });
        } elseif (! $this->hasIndex('trade_sales_report_submissions', $deliveryCreatedIdx)) {
            // Partial apply: table created before the long auto-name index failed.
            Schema::table('trade_sales_report_submissions', function (Blueprint $table) use ($deliveryCreatedIdx) {
                $table->index(['trade_delivery_id', 'created_at'], $deliveryCreatedIdx);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('trade_sales_report_submissions');
        if (Schema::hasTable('trade_deliveries')
            && Schema::hasColumn('trade_deliveries', 'reported_by_customer_id')) {
            Schema::table('trade_deliveries', function (Blueprint $table) {
                $table->dropConstrainedForeignId('reported_by_customer_id');
            });
        }
    }

    private function hasIndex(string $table, string $indexName): bool
    {
        $sm = Schema::getConnection()->getSchemaBuilder();
        // Laravel 11+/12: getIndexListing may not exist; use doctrine-free information_schema.
        $driver = Schema::getConnection()->getDriverName();
        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            $row = Schema::getConnection()->selectOne(
                'SELECT INDEX_NAME AS name FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
                 LIMIT 1',
                [$table, $indexName],
            );

            return $row !== null;
        }

        if ($driver === 'sqlite') {
            $rows = Schema::getConnection()->select("PRAGMA index_list('{$table}')");
            foreach ($rows as $row) {
                $name = is_object($row) ? ($row->name ?? null) : ($row['name'] ?? null);
                if ($name === $indexName) {
                    return true;
                }
            }

            return false;
        }

        if ($driver === 'pgsql') {
            $row = Schema::getConnection()->selectOne(
                'SELECT indexname AS name FROM pg_indexes WHERE tablename = ? AND indexname = ? LIMIT 1',
                [$table, $indexName],
            );

            return $row !== null;
        }

        return false;
    }
};
