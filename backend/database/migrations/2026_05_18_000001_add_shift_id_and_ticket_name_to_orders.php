<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds two columns the codebase was already assuming existed:
 *
 *  - `shift_id` so each order is anchored to a cashier shift. ShiftController::close
 *    already queries Order::where('shift_id', …) for cash sales totals; without
 *    this column the close-shift summary was silently zero.
 *  - `ticket_name` so cashiers can park multiple named tabs (Loyverse-style
 *    "Save ticket"). The previous flow only supported one held order per
 *    device.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            if (!Schema::hasColumn('orders', 'shift_id')) {
                $table->foreignId('shift_id')
                    ->nullable()
                    ->after('device_id')
                    ->constrained('shifts')
                    ->nullOnDelete();
                $table->index('shift_id', 'orders_shift_id_idx');
            }
            if (!Schema::hasColumn('orders', 'ticket_name')) {
                $table->string('ticket_name', 80)
                    ->nullable()
                    ->after('status')
                    ->comment('Friendly name for a parked/held ticket, e.g. "Table 4 drinks"');
            }
            if (!Schema::hasColumn('orders', 'ticket_note')) {
                $table->string('ticket_note', 255)
                    ->nullable()
                    ->after('ticket_name');
            }
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            if (Schema::hasColumn('orders', 'ticket_note')) {
                $table->dropColumn('ticket_note');
            }
            if (Schema::hasColumn('orders', 'ticket_name')) {
                $table->dropColumn('ticket_name');
            }
            if (Schema::hasColumn('orders', 'shift_id')) {
                $table->dropForeign(['shift_id']);
                $table->dropIndex('orders_shift_id_idx');
                $table->dropColumn('shift_id');
            }
        });
    }
};
