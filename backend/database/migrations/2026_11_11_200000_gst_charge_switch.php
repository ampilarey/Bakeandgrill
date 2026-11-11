<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One switch for GST on sales (owner, 2026-11-11: "How can i turn off all gst
 * from admin?"). On by default, so nothing changes until it is switched off.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('gst_settings', 'charge_gst')) {
            Schema::table('gst_settings', function (Blueprint $table) {
                $table->boolean('charge_gst')->default(true);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('gst_settings', 'charge_gst')) {
            Schema::table('gst_settings', function (Blueprint $table) {
                $table->dropColumn('charge_gst');
            });
        }
    }
};
