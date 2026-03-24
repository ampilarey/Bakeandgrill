<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add gift card tracking columns to the orders table.
     * gift_card_code        — the code used (for audit trail, deduction on confirmation)
     * gift_card_discount_laar — amount deducted from order total (in laari)
     */
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('gift_card_code', 20)->nullable()->after('promo_discount_laar');
            $table->unsignedBigInteger('gift_card_discount_laar')->default(0)->after('gift_card_code');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['gift_card_code', 'gift_card_discount_laar']);
        });
    }
};
