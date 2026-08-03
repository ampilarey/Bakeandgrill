<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Opt-in: when true, guests (no linked customer) cannot use the promotion.
 * Default false preserves today's guest-eligible first-order behaviour.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('promotions')) {
            return;
        }

        Schema::table('promotions', function (Blueprint $table): void {
            if (!Schema::hasColumn('promotions', 'registered_only')) {
                $table->boolean('registered_only')->default(false)->after('first_order_only');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('promotions')) {
            return;
        }

        Schema::table('promotions', function (Blueprint $table): void {
            if (Schema::hasColumn('promotions', 'registered_only')) {
                $table->dropColumn('registered_only');
            }
        });
    }
};
