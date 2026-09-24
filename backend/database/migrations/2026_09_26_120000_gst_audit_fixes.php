<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * GST audit, 2026-09-26.
 *
 * - gst_period_locks.lock_note: why a period was filed with open warnings.
 * - gst_settings.filing_due_day / filing_reminder_days: when the return is
 *   due each month and how many days ahead the owners are texted if the
 *   period before is still not locked. 0 turns the reminder off.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('gst_period_locks', 'lock_note')) {
            Schema::table('gst_period_locks', function (Blueprint $table): void {
                $table->text('lock_note')->nullable();
            });
        }

        Schema::table('gst_settings', function (Blueprint $table): void {
            if (!Schema::hasColumn('gst_settings', 'filing_due_day')) {
                $table->unsignedTinyInteger('filing_due_day')->default(28);
            }
            if (!Schema::hasColumn('gst_settings', 'filing_reminder_days')) {
                $table->unsignedTinyInteger('filing_reminder_days')->default(3);
            }
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('gst_period_locks', 'lock_note')) {
            Schema::table('gst_period_locks', fn (Blueprint $table) => $table->dropColumn('lock_note'));
        }
        foreach (['filing_due_day', 'filing_reminder_days'] as $column) {
            if (Schema::hasColumn('gst_settings', $column)) {
                Schema::table('gst_settings', fn (Blueprint $table) => $table->dropColumn($column));
            }
        }
    }
};
