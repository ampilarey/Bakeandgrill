<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * When the owner was last texted about an open reorder alert (audit,
 * 2026-09-24). Before, only alerts created that morning were texted:
 * one that hit its reorder point while snoozed never was, and one that
 * sat below the point for weeks was never mentioned again.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_reorder_alerts', function (Blueprint $table): void {
            $table->timestamp('notified_at')->nullable()->after('resolved_at');
        });
    }

    public function down(): void
    {
        Schema::table('inventory_reorder_alerts', function (Blueprint $table): void {
            $table->dropColumn('notified_at');
        });
    }
};
