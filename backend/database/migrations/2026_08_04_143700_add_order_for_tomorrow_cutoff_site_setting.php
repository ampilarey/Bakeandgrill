<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Owner-set cutoff (HH:mm). After this local time, "tomorrow" means the day after.
 * Default 20:00 so the feature works before the owner changes anything.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }

        $row = [
            'value' => '20:00',
            'type' => 'text',
            'group' => 'Online Ordering',
            'label' => 'Order for tomorrow cutoff',
            'description' => 'After this time, “tomorrow” at checkout means the day after. Format HH:mm (24-hour).',
            'is_public' => true,
            'updated_at' => now(),
            'created_at' => now(),
        ];

        $attrs = ['key' => 'order_for_tomorrow_cutoff'];
        if (Schema::hasColumn('site_settings', 'scope')) {
            $attrs['scope'] = 'shared';
        }
        if (Schema::hasColumn('site_settings', 'locale')) {
            $attrs['locale'] = 'en';
        }

        DB::table('site_settings')->updateOrInsert($attrs, array_merge($attrs, $row));
    }

    public function down(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }

        $query = DB::table('site_settings')->where('key', 'order_for_tomorrow_cutoff');
        if (Schema::hasColumn('site_settings', 'scope')) {
            $query->where('scope', 'shared');
        }
        if (Schema::hasColumn('site_settings', 'locale')) {
            $query->where('locale', 'en');
        }
        $query->delete();
    }
};
