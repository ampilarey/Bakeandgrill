<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Separate payment collection from order creation for shift cash reporting.
 *
 * Historical backfill assigns creation-shift to old payments (best effort).
 * Cross-cashier handoffs before this migration may be mis-attributed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->foreignId('collected_by_user_id')
                ->nullable()
                ->after('order_id')
                ->constrained('users')
                ->nullOnDelete();
            $table->foreignId('shift_id')
                ->nullable()
                ->after('collected_by_user_id')
                ->constrained('shifts')
                ->nullOnDelete();
            $table->index('shift_id');
        });

        Schema::table('refunds', function (Blueprint $table) {
            $table->foreignId('shift_id')
                ->nullable()
                ->after('user_id')
                ->constrained('shifts')
                ->nullOnDelete();
        });

        Schema::table('devices', function (Blueprint $table) {
            $table->foreignId('last_user_id')
                ->nullable()
                ->after('user_id')
                ->constrained('users')
                ->nullOnDelete();
        });

        if (Schema::hasTable('payments') && Schema::hasTable('orders')) {
            $driver = Schema::getConnection()->getDriverName();
            if ($driver === 'sqlite') {
                DB::statement('
                    UPDATE payments
                    SET shift_id = (
                        SELECT shift_id FROM orders WHERE orders.id = payments.order_id
                    ),
                    collected_by_user_id = (
                        SELECT user_id FROM orders WHERE orders.id = payments.order_id
                    )
                    WHERE shift_id IS NULL
                    AND EXISTS (
                        SELECT 1 FROM orders WHERE orders.id = payments.order_id AND orders.shift_id IS NOT NULL
                    )
                ');
            } else {
                DB::statement('
                    UPDATE payments p
                    INNER JOIN orders o ON p.order_id = o.id
                    SET p.shift_id = o.shift_id,
                        p.collected_by_user_id = o.user_id
                    WHERE p.shift_id IS NULL AND o.shift_id IS NOT NULL
                ');
            }
        }
    }

    public function down(): void
    {
        Schema::table('devices', function (Blueprint $table) {
            $table->dropConstrainedForeignId('last_user_id');
        });

        Schema::table('refunds', function (Blueprint $table) {
            $table->dropConstrainedForeignId('shift_id');
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('shift_id');
            $table->dropConstrainedForeignId('collected_by_user_id');
        });
    }
};
