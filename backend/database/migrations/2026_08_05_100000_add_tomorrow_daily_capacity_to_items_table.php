<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-item daily maximum for collect-tomorrow orders.
 * Null = unlimited (current behaviour). Only set for items that need a kitchen cap.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('items')) {
            return;
        }

        Schema::table('items', function (Blueprint $table) {
            if (!Schema::hasColumn('items', 'tomorrow_daily_capacity')) {
                $table->unsignedInteger('tomorrow_daily_capacity')->nullable()->after('allow_pre_order');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('items') || !Schema::hasColumn('items', 'tomorrow_daily_capacity')) {
            return;
        }

        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('tomorrow_daily_capacity');
        });
    }
};
