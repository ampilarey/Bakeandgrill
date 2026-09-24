<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Kitchen audit, 2026-09-26.
 *
 * - orders.kitchen_started_at: when the kitchen started cooking. A payment
 *   rewrites the status to `paid`, which the kitchen screen read as "new";
 *   this is what keeps a started ticket in Cooking.
 * - orders.ready_at: when the order was first marked ready. A ticket that
 *   was ready and then paid (dine-in paying at the end) is done for the
 *   kitchen and leaves the board.
 * - order_items.kitchen_sent_at: when the kitchen was told about this line,
 *   so an add-on chit prints only the new lines.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            if (!Schema::hasColumn('orders', 'kitchen_started_at')) {
                $table->timestamp('kitchen_started_at')->nullable();
            }
            if (!Schema::hasColumn('orders', 'ready_at')) {
                $table->timestamp('ready_at')->nullable();
            }
        });

        if (!Schema::hasColumn('order_items', 'kitchen_sent_at')) {
            Schema::table('order_items', function (Blueprint $table): void {
                $table->timestamp('kitchen_sent_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        foreach (['kitchen_started_at', 'ready_at'] as $column) {
            if (Schema::hasColumn('orders', $column)) {
                Schema::table('orders', fn (Blueprint $table) => $table->dropColumn($column));
            }
        }
        if (Schema::hasColumn('order_items', 'kitchen_sent_at')) {
            Schema::table('order_items', fn (Blueprint $table) => $table->dropColumn('kitchen_sent_at'));
        }
    }
};
