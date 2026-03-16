<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds opening_time and closing_time to reservation_settings so the restaurant
 * can change their booking hours without a code deploy.
 * Defaults preserve the previously hardcoded 09:00–22:00 window.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reservation_settings', function (Blueprint $table): void {
            if (!Schema::hasColumn('reservation_settings', 'opening_time')) {
                $table->time('opening_time')->default('09:00:00')->after('auto_cancel_minutes');
            }
            if (!Schema::hasColumn('reservation_settings', 'closing_time')) {
                $table->time('closing_time')->default('22:00:00')->after('opening_time');
            }
        });
    }

    public function down(): void
    {
        Schema::table('reservation_settings', function (Blueprint $table): void {
            $table->dropColumn(['opening_time', 'closing_time']);
        });
    }
};
