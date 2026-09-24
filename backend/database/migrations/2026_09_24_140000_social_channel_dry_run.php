<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Owner's shortlist (2026-09-24): a "dry run" flag per channel. While it
 * is on, every delivery to that channel is logged as what would have been
 * posted and nothing reaches the platform — a week of watching an
 * automation before letting it loose.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('social_channels', function (Blueprint $table) {
            $table->boolean('dry_run')->default(false)->after('language');
        });
    }

    public function down(): void
    {
        Schema::table('social_channels', function (Blueprint $table) {
            $table->dropColumn('dry_run');
        });
    }
};
