<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which orders an offer is for (owner, 2026-11-08: "today all online orders will get 10% discount"
 * or "all dine in customers will get 100% discount on a dish"): where it was ordered (till, the
 * order app) and the order type. Null means every order, as before.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            if (!Schema::hasColumn('promotions', 'order_channels')) {
                $table->json('order_channels')->nullable()->after('scope');
            }
            if (!Schema::hasColumn('promotions', 'order_types')) {
                $table->json('order_types')->nullable()->after('order_channels');
            }
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            foreach (['order_types', 'order_channels'] as $col) {
                if (Schema::hasColumn('promotions', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
