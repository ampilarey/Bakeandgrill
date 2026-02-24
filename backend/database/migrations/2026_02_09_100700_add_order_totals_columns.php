<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds integer laari columns to orders for deterministic financial calculations,
 * plus columns for tracking promo and loyalty discounts separately.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->bigInteger('subtotal_laar')->nullable()->after('total');
            $table->bigInteger('tax_laar')->nullable()->after('subtotal_laar');
            $table->bigInteger('promo_discount_laar')->nullable()->after('tax_laar');
            $table->bigInteger('loyalty_discount_laar')->nullable()->after('promo_discount_laar');
            $table->bigInteger('manual_discount_laar')->nullable()->after('loyalty_discount_laar');
            $table->bigInteger('total_laar')->nullable()->after('manual_discount_laar');
            $table->boolean('tax_inclusive')->default(false)->after('total_laar');
            $table->unsignedSmallInteger('tax_rate_bp')->default(0)->after('tax_inclusive');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropColumn([
                'subtotal_laar',
                'tax_laar',
                'promo_discount_laar',
                'loyalty_discount_laar',
                'manual_discount_laar',
                'total_laar',
                'tax_inclusive',
                'tax_rate_bp',
            ]);
        });
    }
};
