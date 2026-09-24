<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Owner's shortlist (2026-09-24): a Dhivehi caption beside the English
 * one, and per channel which language(s) it posts — Viber and Telegram
 * audiences here skew Dhivehi; the Facebook Page reads both.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('social_channels', function (Blueprint $table) {
            $table->string('language', 8)->default('both')->after('is_test_channel');
        });
    }

    public function down(): void
    {
        Schema::table('social_channels', function (Blueprint $table) {
            $table->dropColumn('language');
        });
    }
};
