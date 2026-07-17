<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        DB::table('site_settings')->updateOrInsert(
            ['key' => 'ops_inventory_reorder_alert_sms'],
            [
                'value' => '0',
                'type' => 'boolean',
                'group' => 'operations',
                'label' => 'Inventory reorder SMS alert',
                'description' => 'SMS owners/managers when the daily reorder check creates new inventory alerts.',
                'is_public' => false,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );
    }

    public function down(): void
    {
        DB::table('site_settings')->where('key', 'ops_inventory_reorder_alert_sms')->delete();
    }
};
