<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        foreach ([
            [
                'key' => 'marketing_tier_milestone_enabled',
                'value' => '0',
                'type' => 'boolean',
                'group' => 'marketing',
                'label' => 'Tier milestone SMS',
                'description' => 'SMS customers who are close to their next loyalty tier.',
                'is_public' => false,
            ],
            [
                'key' => 'marketing_tier_milestone_within',
                'value' => '50',
                'type' => 'int',
                'group' => 'marketing',
                'label' => 'Tier milestone points window',
                'description' => 'Notify when customer is within this many points of the next tier.',
                'is_public' => false,
            ],
            [
                'key' => 'marketing_tier_milestone_sms_template',
                'value' => "You're only {points_left} points away from {next_tier} at Bake & Grill! Order today: {url}",
                'type' => 'text',
                'group' => 'marketing',
                'label' => 'Tier milestone SMS template',
                'description' => 'Placeholders: {points_left}, {next_tier}, {url}',
                'is_public' => false,
            ],
            [
                'key' => 'ops_delivery_delay_alert_sms',
                'value' => '0',
                'type' => 'boolean',
                'group' => 'operations',
                'label' => 'Delivery delay SMS alert',
                'description' => 'SMS business phone when delivery orders pass estimated ready time.',
                'is_public' => false,
            ],
        ] as $row) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $row['key']],
                array_merge($row, ['created_at' => $now, 'updated_at' => $now]),
            );
        }
    }

    public function down(): void
    {
        DB::table('site_settings')->whereIn('key', [
            'marketing_tier_milestone_enabled',
            'marketing_tier_milestone_within',
            'marketing_tier_milestone_sms_template',
            'ops_delivery_delay_alert_sms',
        ])->delete();
    }
};
