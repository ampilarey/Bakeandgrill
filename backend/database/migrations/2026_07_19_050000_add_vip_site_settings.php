<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        $rows = [
            [
                'key' => 'vip_min_spend_mvr',
                'value' => '5000',
                'type' => 'text',
                'group' => 'Customers',
                'label' => 'VIP minimum lifetime spend (MVR)',
                'description' => 'Paid-order lifetime spend required for the VIP CRM segment. Separate from loyalty gold/platinum (points).',
                'is_public' => false,
            ],
            [
                'key' => 'vip_min_paid_orders',
                'value' => '2',
                'type' => 'text',
                'group' => 'Customers',
                'label' => 'VIP minimum paid orders',
                'description' => 'Minimum paid orders required (with spend threshold) for VIP status.',
                'is_public' => false,
            ],
            [
                'key' => 'vip_auto_sync_tag',
                'value' => '1',
                'type' => 'boolean',
                'group' => 'Customers',
                'label' => 'Auto-sync VIP customer tag',
                'description' => 'When on, attach/detach the seeded VIP tag to match computed VIP status after paid orders.',
                'is_public' => false,
            ],
        ];

        foreach ($rows as $row) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $row['key']],
                array_merge($row, [
                    'created_at' => $now,
                    'updated_at' => $now,
                ]),
            );
        }
    }

    public function down(): void
    {
        DB::table('site_settings')->whereIn('key', [
            'vip_min_spend_mvr',
            'vip_min_paid_orders',
            'vip_auto_sync_tag',
        ])->delete();
    }
};
