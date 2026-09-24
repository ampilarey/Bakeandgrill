<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Reservation audit, 2026-09-25. Capacity now respects how long a booking
 * lasts, a party too big for one table can be seated across two, and
 * guests cannot cancel inside the owner's cut-off.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reservations', function (Blueprint $table): void {
            // A second (or third) table joined to `table_id` for a large party.
            $table->json('extra_table_ids')->nullable()->after('table_id');
        });
        Schema::table('reservation_settings', function (Blueprint $table): void {
            // Guests may cancel online only this many hours before the slot; 0 = any time.
            $table->unsignedSmallInteger('cancel_cutoff_hours')->default(2)->after('auto_cancel_minutes');
        });
    }

    public function down(): void
    {
        Schema::table('reservations', function (Blueprint $table): void {
            $table->dropColumn('extra_table_ids');
        });
        Schema::table('reservation_settings', function (Blueprint $table): void {
            $table->dropColumn('cancel_cutoff_hours');
        });
    }
};
