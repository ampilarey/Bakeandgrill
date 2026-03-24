<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('referral_code', 24)->nullable()->after('gift_card_discount_laar');
            $table->unsignedBigInteger('referral_discount_laar')->default(0)->after('referral_code');
            $table->boolean('referral_redemption_recorded')->default(false)->after('referral_discount_laar');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['referral_code', 'referral_discount_laar', 'referral_redemption_recorded']);
        });
    }
};
