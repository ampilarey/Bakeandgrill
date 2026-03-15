<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private function indexExists(string $table, string $indexName): bool
    {
        $results = \Illuminate\Support\Facades\DB::select(
            "SHOW INDEX FROM `{$table}` WHERE Key_name = ?",
            [$indexName]
        );
        return count($results) > 0;
    }

    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            if (Schema::hasColumn('payments', 'processed_at') && ! $this->indexExists('payments', 'payments_processed_at_index')) {
                $table->index('processed_at');
            }
            if (Schema::hasColumn('payments', 'reference_number') && ! $this->indexExists('payments', 'payments_reference_number_index')) {
                $table->index('reference_number');
            }
        });

        Schema::table('orders', function (Blueprint $table) {
            if (! $this->indexExists('orders', 'orders_status_created_at_index')) {
                $table->index(['status', 'created_at']);
            }
            if (Schema::hasColumn('orders', 'customer_id') && ! $this->indexExists('orders', 'orders_customer_id_index')) {
                $table->index('customer_id');
            }
            if (Schema::hasColumn('orders', 'shift_id') && ! $this->indexExists('orders', 'orders_shift_id_index')) {
                $table->index('shift_id');
            }
        });

        Schema::table('order_items', function (Blueprint $table) {
            if (Schema::hasColumn('order_items', 'item_id') && ! $this->indexExists('order_items', 'order_items_item_id_index')) {
                $table->index('item_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            if ($this->indexExists('payments', 'payments_processed_at_index')) {
                $table->dropIndex(['processed_at']);
            }
            if ($this->indexExists('payments', 'payments_reference_number_index')) {
                $table->dropIndex(['reference_number']);
            }
        });

        Schema::table('orders', function (Blueprint $table) {
            if ($this->indexExists('orders', 'orders_status_created_at_index')) {
                $table->dropIndex(['status', 'created_at']);
            }
            if ($this->indexExists('orders', 'orders_customer_id_index')) {
                $table->dropIndex(['customer_id']);
            }
            if ($this->indexExists('orders', 'orders_shift_id_index')) {
                $table->dropIndex(['shift_id']);
            }
        });

        Schema::table('order_items', function (Blueprint $table) {
            if ($this->indexExists('order_items', 'order_items_item_id_index')) {
                $table->dropIndex(['item_id']);
            }
        });
    }
};
