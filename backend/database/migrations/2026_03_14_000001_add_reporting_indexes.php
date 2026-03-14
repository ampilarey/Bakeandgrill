<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            if (Schema::hasColumn('payments', 'processed_at')) {
                $table->index('processed_at');
            }
            if (Schema::hasColumn('payments', 'reference_number')) {
                $table->index('reference_number');
            }
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->index(['status', 'created_at']);
            if (Schema::hasColumn('orders', 'customer_id')) {
                $table->index('customer_id');
            }
            if (Schema::hasColumn('orders', 'shift_id')) {
                $table->index('shift_id');
            }
        });

        Schema::table('order_items', function (Blueprint $table) {
            if (Schema::hasColumn('order_items', 'item_id')) {
                $table->index('item_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            if (Schema::hasColumn('payments', 'processed_at')) {
                $table->dropIndex(['processed_at']);
            }
            if (Schema::hasColumn('payments', 'reference_number')) {
                $table->dropIndex(['reference_number']);
            }
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['status', 'created_at']);
            if (Schema::hasColumn('orders', 'customer_id')) {
                $table->dropIndex(['customer_id']);
            }
            if (Schema::hasColumn('orders', 'shift_id')) {
                $table->dropIndex(['shift_id']);
            }
        });

        Schema::table('order_items', function (Blueprint $table) {
            if (Schema::hasColumn('order_items', 'item_id')) {
                $table->dropIndex(['item_id']);
            }
        });
    }
};
