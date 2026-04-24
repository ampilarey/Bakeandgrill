<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $settings = [
            [
                'key' => 'sms_customer_preparing_enabled',
                'value' => 'true',
                'type' => 'boolean',
                'group' => 'notifications',
                'label' => 'SMS: Order Preparing',
                'description' => 'Send customer an SMS when the kitchen starts preparing their order.',
                'is_public' => false,
            ],
            [
                'key' => 'sms_customer_ready_enabled',
                'value' => 'true',
                'type' => 'boolean',
                'group' => 'notifications',
                'label' => 'SMS: Order Ready',
                'description' => 'Send customer an SMS when their order is ready for pickup or packed for delivery.',
                'is_public' => false,
            ],
            [
                'key' => 'sms_customer_on_the_way_enabled',
                'value' => 'true',
                'type' => 'boolean',
                'group' => 'notifications',
                'label' => 'SMS: Out for Delivery',
                'description' => 'Send customer an SMS when their delivery order is on the way.',
                'is_public' => false,
            ],
        ];

        foreach ($settings as $setting) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $setting['key']],
                array_merge($setting, [
                    'created_at' => now(),
                    'updated_at' => now(),
                ]),
            );
        }
    }

    public function down(): void
    {
        DB::table('site_settings')->whereIn('key', [
            'sms_customer_preparing_enabled',
            'sms_customer_ready_enabled',
            'sms_customer_on_the_way_enabled',
        ])->delete();
    }
};
