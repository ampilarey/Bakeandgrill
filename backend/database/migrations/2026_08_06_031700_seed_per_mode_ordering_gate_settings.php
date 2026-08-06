<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Per-mode gates under Today / Tomorrow ordering.
 * Defaults preserve current behaviour: pickup + tomorrow pickup/delivery ON,
 * tomorrow eat-here OFF (was hard-blocked).
 */
return new class extends Migration
{
    /** @var list<array{key: string, value: string, label: string, description: string}> */
    private const ROWS = [
        [
            'key' => 'pickup_ordering_enabled',
            'value' => '1',
            'label' => 'Pickup (today)',
            'description' => 'Customers can place same-day pickup orders.',
        ],
        [
            'key' => 'tomorrow_pickup_enabled',
            'value' => '1',
            'label' => 'Tomorrow — pickup',
            'description' => 'Customers can order today and collect tomorrow.',
        ],
        [
            'key' => 'tomorrow_delivery_enabled',
            'value' => '1',
            'label' => 'Tomorrow — delivery',
            'description' => 'Customers can order today for delivery tomorrow.',
        ],
        [
            'key' => 'tomorrow_dine_in_enabled',
            'value' => '0',
            'label' => 'Tomorrow — eat here',
            'description' => 'Customers can book an eat-here order for tomorrow.',
        ],
    ];

    public function up(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }

        $hasScope = Schema::hasColumn('site_settings', 'scope');
        $hasLocale = Schema::hasColumn('site_settings', 'locale');

        foreach (self::ROWS as $def) {
            $row = [
                'value' => $def['value'],
                'type' => 'boolean',
                'group' => 'Online Ordering',
                'label' => $def['label'],
                'description' => $def['description'],
                'is_public' => true,
                'updated_at' => now(),
                'created_at' => now(),
            ];

            $attrs = ['key' => $def['key']];
            if ($hasScope) {
                $attrs['scope'] = 'shared';
            }
            if ($hasLocale) {
                $attrs['locale'] = 'en';
            }

            DB::table('site_settings')->updateOrInsert($attrs, array_merge($attrs, $row));
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }

        $keys = array_column(self::ROWS, 'key');
        $query = DB::table('site_settings')->whereIn('key', $keys);
        if (Schema::hasColumn('site_settings', 'scope')) {
            $query->where('scope', 'shared');
        }
        if (Schema::hasColumn('site_settings', 'locale')) {
            $query->where('locale', 'en');
        }
        $query->delete();
    }
};
