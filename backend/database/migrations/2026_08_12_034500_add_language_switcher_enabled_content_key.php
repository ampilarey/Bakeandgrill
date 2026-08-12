<?php

declare(strict_types=1);

use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Optional EN/ދވ language switcher — default off until the owner enables it
 * in Content Hub → General.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        $attrs = [
            'key' => 'language_switcher_enabled',
            'value' => 'false',
            'type' => 'boolean',
            'group' => 'General',
            'label' => 'Show language switcher (EN / ދވ)',
            'description' => 'When on, show the EN/ދވ toggle on the website and order app. Off by default.',
            'is_public' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ];
        if (Schema::hasColumn('site_settings', 'scope')) {
            $attrs['scope'] = 'shared';
        }
        if (Schema::hasColumn('site_settings', 'locale')) {
            $attrs['locale'] = 'en';
        }

        $query = DB::table('site_settings')->where('key', 'language_switcher_enabled');
        if (Schema::hasColumn('site_settings', 'scope')) {
            $query->where('scope', 'shared');
        }
        if (Schema::hasColumn('site_settings', 'locale')) {
            $query->where('locale', 'en');
        }

        if ($query->exists()) {
            $query->update([
                'type' => 'boolean',
                'group' => 'General',
                'label' => $attrs['label'],
                'description' => $attrs['description'],
                'is_public' => true,
                'updated_at' => $now,
            ]);
        } else {
            DB::table('site_settings')->insert($attrs);
        }

        SiteSetting::bust();
    }

    public function down(): void
    {
        $query = DB::table('site_settings')->where('key', 'language_switcher_enabled');
        if (Schema::hasColumn('site_settings', 'scope')) {
            $query->where('scope', 'shared');
        }
        if (Schema::hasColumn('site_settings', 'locale')) {
            $query->where('locale', 'en');
        }
        $query->delete();

        SiteSetting::bust();
    }
};
