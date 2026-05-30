<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Legacy rows stored percentage promos as basis points (1000 = 10%).
 * Runtime + admin UI use whole percent (10 = 10%). Convert any
 * percentage promo with discount_value > 100 by dividing by 100.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('promotions')
            ->where('type', 'percentage')
            ->where('discount_value', '>', 100)
            ->update([
                'discount_value' => DB::raw('discount_value / 100'),
                'updated_at' => now(),
            ]);
    }

    public function down(): void
    {
        DB::table('promotions')
            ->where('type', 'percentage')
            ->where('discount_value', '<=', 100)
            ->where('discount_value', '>', 0)
            ->update([
                'discount_value' => DB::raw('discount_value * 100'),
                'updated_at' => now(),
            ]);
    }
};
