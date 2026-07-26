<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const KEY = 'home_section_order';

    private const DEFAULT = '["specials","featured","categories","proof","cta","location"]';

    public function up(): void
    {
        if (! Schema::hasTable('site_settings')) {
            return;
        }

        $hasScope = Schema::hasColumn('site_settings', 'scope');
        $hasLocale = Schema::hasColumn('site_settings', 'locale');
        $now = now();

        $attrs = ['key' => self::KEY];
        if ($hasScope) {
            $attrs['scope'] = 'shared';
        }
        if ($hasLocale) {
            $attrs['locale'] = 'en';
        }

        if (DB::table('site_settings')->where($attrs)->exists()) {
            return;
        }

        $row = [
            'value' => self::DEFAULT,
            'type' => 'json',
            'group' => 'Homepage',
            'label' => 'Home Section Order',
            'description' => null,
            'is_public' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ];
        if ($hasScope) {
            $row['scope'] = 'shared';
        }
        if ($hasLocale) {
            $row['locale'] = 'en';
        }

        DB::table('site_settings')->insert(array_merge($attrs, $row));
    }

    public function down(): void
    {
        if (! Schema::hasTable('site_settings')) {
            return;
        }

        $query = DB::table('site_settings')->where('key', self::KEY);
        if (Schema::hasColumn('site_settings', 'scope')) {
            $query->where('scope', 'shared');
        }
        if (Schema::hasColumn('site_settings', 'locale')) {
            $query->where('locale', 'en');
        }

        $query->delete();
    }
};
