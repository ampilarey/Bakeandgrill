<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pricing audit, 2026-10-01, finding 1: an automatic promotion aimed at an
 * item or a category ("20% off all drinks") is priced straight into the line,
 * so it never recorded a use. Its use limit, per-customer limit, budget and
 * margin floor did nothing, and its reports showed no use and no cost.
 *
 * The line now names the promotion that priced it, so the order can be
 * counted against that promotion when it is paid.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('order_items', 'promotion_id')) {
            return;
        }

        Schema::table('order_items', function (Blueprint $table): void {
            $table->unsignedBigInteger('promotion_id')->nullable()->after('daily_special_id');
            $table->index('promotion_id');
        });
    }

    public function down(): void
    {
        if (!Schema::hasColumn('order_items', 'promotion_id')) {
            return;
        }

        Schema::table('order_items', function (Blueprint $table): void {
            $table->dropIndex(['promotion_id']);
            $table->dropColumn('promotion_id');
        });
    }
};
