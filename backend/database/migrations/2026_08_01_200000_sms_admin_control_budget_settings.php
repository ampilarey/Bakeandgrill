<?php

declare(strict_types=1);

use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        $rows = [
            [
                'key' => 'sms_budget_monthly_segments',
                'value' => '',
                'type' => 'text',
                'group' => 'SMS',
                'label' => 'Monthly SMS segment ceiling',
                'description' => 'Max segments per calendar month (blank = unlimited). always_on auth types are never blocked.',
                'is_public' => false,
            ],
            [
                'key' => 'sms_budget_per_campaign_segments',
                'value' => '',
                'type' => 'text',
                'group' => 'SMS',
                'label' => 'Per-campaign SMS segment ceiling',
                'description' => 'Max segments per campaign id (blank = unlimited).',
                'is_public' => false,
            ],
        ];

        foreach ($rows as $row) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $row['key'], 'scope' => 'shared', 'locale' => 'en'],
                array_merge($row, [
                    'scope' => 'shared',
                    'locale' => 'en',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]),
            );
        }

        SiteSetting::bust();
    }

    public function down(): void
    {
        DB::table('site_settings')->whereIn('key', [
            'sms_budget_monthly_segments',
            'sms_budget_per_campaign_segments',
        ])->delete();
        SiteSetting::bust();
    }
};
