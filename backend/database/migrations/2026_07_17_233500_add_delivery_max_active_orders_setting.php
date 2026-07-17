<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Wave E — optional cap on concurrent open delivery orders (0 = unlimited).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('site_settings')->updateOrInsert(
            ['key' => 'delivery_max_active_orders'],
            [
                'value' => '0',
                'type' => 'text',
                'group' => 'Delivery',
                'label' => 'Max active delivery orders',
                'description' => 'When > 0, new customer delivery orders are rejected while this many non-terminal delivery tickets are open. 0 = no capacity limit.',
                'is_public' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        );
    }

    public function down(): void
    {
        DB::table('site_settings')->where('key', 'delivery_max_active_orders')->delete();
    }
};
