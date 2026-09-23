<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Social Hub audit (2026-09-24): a channel's last health check. Facebook
 * and Instagram tokens expire and the first sign used to be a failed post;
 * `social:check-channels` now asks each platform daily and keeps the
 * answer here: {status, message, token_expires_at, account_label,
 * checked_at, alerted_key}.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('social_channels', function (Blueprint $table) {
            $table->json('health')->nullable()->after('last_published_at');
        });
    }

    public function down(): void
    {
        Schema::table('social_channels', function (Blueprint $table) {
            $table->dropColumn('health');
        });
    }
};
