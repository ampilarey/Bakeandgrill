<?php

declare(strict_types=1);

use App\Support\PrayerTimeHelper;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Island used for TV prayer-break timing and banner countdown.
 * Defaults to Malé so existing boards keep the same schedule.
 */
return new class extends Migration
{
    public function up(): void
    {
        $maleId = PrayerTimeHelper::MALE_ISLAND_FALLBACK_ID;
        if (Schema::hasTable('prayer_islands')) {
            $found = DB::table('prayer_islands')
                ->where('is_active', true)
                ->where(function ($q) {
                    $q->where('name', PrayerTimeHelper::MALE_ISLAND_DV_NAME)
                        ->orWhere('name_latin', 'Malé')
                        ->orWhere('name_latin', 'Male');
                })
                ->value('id');
            if ($found) {
                $maleId = (int) $found;
            }
        }

        $attrs = ['key' => 'signage_prayer_island_id'];
        if (Schema::hasColumn('site_settings', 'scope')) {
            $attrs['scope'] = 'shared';
        }

        DB::table('site_settings')->updateOrInsert(
            $attrs,
            [
                'value' => (string) $maleId,
                'type' => 'text',
                'group' => 'System',
                'label' => 'Signage prayer island',
                'description' => 'Island whose prayer times drive the TV banner countdown and automatic prayer-break slides.',
                'is_public' => false,
                'updated_at' => now(),
                'created_at' => now(),
            ]
        );

        Cache::forget('site_setting.signage_prayer_island_id');
    }

    public function down(): void
    {
        DB::table('site_settings')->where('key', 'signage_prayer_island_id')->delete();
        Cache::forget('site_setting.signage_prayer_island_id');
    }
};
