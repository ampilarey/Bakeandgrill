<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Seeds delivery-specific site_settings for Wave E:
 * - Delivery hours schedule (separate from the general ordering schedule)
 * - Delivery zone whitelist (islands / areas that can receive delivery)
 * - Delivery pause message
 */
return new class extends Migration
{
    public function up(): void
    {
        $settings = [
            [
                'key' => 'delivery_schedule',
                'value' => null,
                'type' => 'json',
                'group' => 'Delivery',
                'label' => 'Delivery Hours Schedule (optional)',
                'description' => 'JSON: {"mon":{"open":"08:00","close":"22:00"},…}. Leave empty to use the same hours as online ordering. Days absent = no delivery that day.',
                'is_public' => true,
            ],
            [
                'key' => 'delivery_zones',
                'value' => null,
                'type' => 'json',
                'group' => 'Delivery',
                'label' => 'Delivery Zones (optional)',
                'description' => 'JSON array of island/area slugs accepted for delivery, e.g. ["male","hulhumale"]. Leave empty to accept all zones.',
                'is_public' => true,
            ],
        ];

        foreach ($settings as $row) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $row['key']],
                array_merge($row, ['created_at' => now(), 'updated_at' => now()]),
            );
        }
    }

    public function down(): void
    {
        DB::table('site_settings')->whereIn('key', [
            'delivery_schedule',
            'delivery_zones',
        ])->delete();
    }
};
