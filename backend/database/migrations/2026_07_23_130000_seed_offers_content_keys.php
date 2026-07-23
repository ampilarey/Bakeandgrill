<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }

        $now = now();
        $hasScope = Schema::hasColumn('site_settings', 'scope');
        $hasLocale = Schema::hasColumn('site_settings', 'locale');

        foreach ([
            [
                'key' => 'offers_headline',
                'value' => 'Offers',
                'label' => 'Offers rail headline',
                'description' => 'Headline above the offers rail on menu/home.',
            ],
            [
                'key' => 'offers_subtext',
                'value' => 'Specials and promos running right now.',
                'label' => 'Offers rail subtext',
                'description' => 'Supporting line under the offers headline.',
            ],
        ] as $def) {
            $row = [
                'key' => $def['key'],
                'value' => $def['value'],
                'type' => 'text',
                'group' => 'Homepage',
                'label' => $def['label'],
                'description' => $def['description'],
                'is_public' => true,
                'updated_at' => $now,
            ];
            if ($hasScope) {
                $row['scope'] = 'shared';
            }
            if ($hasLocale) {
                $row['locale'] = 'en';
            }

            $query = DB::table('site_settings')->where('key', $def['key']);
            if ($hasScope) {
                $query->where('scope', 'shared');
            }
            if ($hasLocale) {
                $query->where('locale', 'en');
            }
            if ($query->exists()) {
                continue;
            }
            $row['created_at'] = $now;
            DB::table('site_settings')->insert($row);
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }
        DB::table('site_settings')->whereIn('key', ['offers_headline', 'offers_subtext'])->delete();
    }
};
