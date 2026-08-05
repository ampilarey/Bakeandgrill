<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Link a reservation to a prepaid dine-in order so the table hold and the
 * paid bill travel together. Nullable: ordinary bookings stay unchanged.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('reservations') || Schema::hasColumn('reservations', 'order_id')) {
            return;
        }

        Schema::table('reservations', function (Blueprint $table) {
            $table->foreignId('order_id')
                ->nullable()
                ->after('table_id')
                ->constrained('orders')
                ->nullOnDelete();
            $table->unique('order_id');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('reservations') || !Schema::hasColumn('reservations', 'order_id')) {
            return;
        }

        Schema::table('reservations', function (Blueprint $table) {
            $table->dropForeign(['order_id']);
            $table->dropUnique(['order_id']);
            $table->dropColumn('order_id');
        });
    }
};
