<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Two more limits an item can carry beside "Most you can make in a day".
 *
 * Owner, 2026-09-21: "catering does not require stock, but there might be a
 * limit to order." A platter that only makes sense from ten up, and a dish
 * that needs two days of notice, had no way to say so; the wizard took any
 * quantity for any date past the one global lead time, and the menu took
 * any quantity today.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('items')) {
            return;
        }

        Schema::table('items', function (Blueprint $table) {
            if (!Schema::hasColumn('items', 'min_order_qty')) {
                // Fewest units one order may take. Null = 1.
                $table->unsignedInteger('min_order_qty')->nullable()->after('tomorrow_daily_capacity');
            }
            if (!Schema::hasColumn('items', 'lead_time_hours')) {
                // Notice the kitchen needs before this dish can be collected. Null = none.
                $table->unsignedInteger('lead_time_hours')->nullable()->after('min_order_qty');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('items')) {
            return;
        }

        Schema::table('items', function (Blueprint $table) {
            foreach (['lead_time_hours', 'min_order_qty'] as $column) {
                if (Schema::hasColumn('items', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
