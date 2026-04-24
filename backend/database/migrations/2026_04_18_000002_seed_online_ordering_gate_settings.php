<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Seeds the three site_settings that control the global online ordering gate.
 *
 * These appear automatically in Admin → Settings → Online Ordering tab
 * without any extra code in SettingsPage.tsx (plain text/boolean/text fields).
 */
return new class extends Migration
{
    public function up(): void
    {
        $settings = [
            [
                'key' => 'online_ordering_enabled',
                'value' => '1',
                'type' => 'boolean',
                'group' => 'Online Ordering',
                'label' => 'Online Ordering',
                'description' => 'Master switch. Turn off to pause all online orders (pickup + delivery). POS is unaffected.',
                'is_public' => true,
            ],
            [
                'key' => 'online_ordering_schedule',
                'value' => null,
                'type' => 'json',
                'group' => 'Online Ordering',
                'label' => 'Daily Schedule (optional)',
                'description' => 'JSON: {"mon":{"open":"07:00","close":"22:00"},"tue":…,"sun":…}. Days not listed are treated as closed. Leave empty to ignore schedule (always open when enabled).',
                'is_public' => true,
            ],
            [
                'key' => 'online_ordering_override_until',
                'value' => null,
                'type' => 'text',
                'group' => 'Online Ordering',
                'label' => 'Force-Open Until (ISO datetime)',
                'description' => 'If set to a future datetime (e.g. 2026-04-18T23:59:00), online ordering is forced ON until that time, ignoring the schedule. Clear to deactivate.',
                'is_public' => true,
            ],
            [
                'key' => 'online_ordering_closed_message',
                'value' => 'Online ordering is currently closed. Please check back during opening hours.',
                'type' => 'text',
                'group' => 'Online Ordering',
                'label' => 'Closed Message',
                'description' => 'Shown to customers when online ordering is unavailable.',
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
            'online_ordering_enabled',
            'online_ordering_schedule',
            'online_ordering_override_until',
            'online_ordering_closed_message',
        ])->delete();
    }
};
