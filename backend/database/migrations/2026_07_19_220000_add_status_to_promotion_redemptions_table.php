<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Soft-release promo redemptions on full refund so campaign/per-customer
 * slots can be reused while keeping an audit trail.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('promotion_redemptions', function (Blueprint $table) {
            $table->string('status', 20)->default('active')->after('discount_laar');
            $table->timestamp('released_at')->nullable()->after('redeemed_at');
        });
    }

    public function down(): void
    {
        Schema::table('promotion_redemptions', function (Blueprint $table) {
            $table->dropColumn(['status', 'released_at']);
        });
    }
};
