<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Pre-order / event request gate — same shape as online ordering.
 * Admin → Ordering Control → Catering & Events.
 */
return new class extends Migration
{
    public function up(): void
    {
        $settings = [
            [
                'key' => 'catering_ordering_enabled',
                'value' => '1',
                'type' => 'boolean',
                'group' => 'Catering & Events',
                'label' => 'Pre-order / Events accepting',
                'description' => 'Master switch. Turn off to pause new customer event / pre-order requests. Existing quotes and admin tools are unaffected.',
                'is_public' => true,
            ],
            [
                'key' => 'catering_ordering_schedule',
                'value' => null,
                'type' => 'json',
                'group' => 'Catering & Events',
                'label' => 'Pre-order daily schedule (optional)',
                'description' => 'JSON day windows. Empty = always open when the master switch is on.',
                'is_public' => true,
            ],
            [
                'key' => 'catering_ordering_override_until',
                'value' => null,
                'type' => 'text',
                'group' => 'Catering & Events',
                'label' => 'Pre-order force-open until',
                'description' => 'Future ISO datetime forces pre-order open until then. Clear to deactivate.',
                'is_public' => true,
            ],
            [
                'key' => 'catering_ordering_closed_message',
                'value' => 'Pre-order is currently closed. Please check back during accepting hours.',
                'type' => 'text',
                'group' => 'Catering & Events',
                'label' => 'Pre-order closed message',
                'description' => 'Shown to customers when new event requests are not accepted.',
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
            'catering_ordering_enabled',
            'catering_ordering_schedule',
            'catering_ordering_override_until',
            'catering_ordering_closed_message',
        ])->delete();
    }
};
