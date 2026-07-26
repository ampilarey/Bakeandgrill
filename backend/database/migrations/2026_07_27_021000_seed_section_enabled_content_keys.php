<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Seed section_*_enabled flags to 'true' so nothing hides on deploy.
 */
return new class extends Migration
{
    /** @var list<array{key: string, group: string, label: string}> */
    private array $keys = [
        ['key' => 'section_hero_enabled', 'group' => 'Hero', 'label' => 'Show Hero Section'],
        ['key' => 'section_specials_enabled', 'group' => 'Homepage', 'label' => 'Show Specials / Offers'],
        ['key' => 'section_featured_enabled', 'group' => 'Homepage', 'label' => 'Show Featured Items'],
        ['key' => 'section_categories_enabled', 'group' => 'Homepage', 'label' => 'Show Categories Section'],
        ['key' => 'section_proof_enabled', 'group' => 'Homepage', 'label' => 'Show Social Proof'],
        ['key' => 'section_cta_enabled', 'group' => 'Homepage', 'label' => 'Show CTA Band'],
        ['key' => 'section_location_enabled', 'group' => 'Homepage', 'label' => 'Show Location Section'],
        ['key' => 'section_reviews_enabled', 'group' => 'Order App', 'label' => 'Show Reviews Section'],
    ];

    public function up(): void
    {
        if (! Schema::hasTable('site_settings')) {
            return;
        }

        $hasScope = Schema::hasColumn('site_settings', 'scope');
        $hasLocale = Schema::hasColumn('site_settings', 'locale');
        $now = now();

        foreach ($this->keys as $def) {
            $attrs = ['key' => $def['key']];
            if ($hasScope) {
                $attrs['scope'] = 'shared';
            }
            if ($hasLocale) {
                $attrs['locale'] = 'en';
            }

            $row = [
                'value' => 'true',
                'type' => 'boolean',
                'group' => $def['group'],
                'label' => $def['label'],
                'description' => null,
                'is_public' => true,
                'updated_at' => $now,
            ];
            if ($hasScope) {
                $row['scope'] = 'shared';
            }
            if ($hasLocale) {
                $row['locale'] = 'en';
            }

            $exists = DB::table('site_settings')->where($attrs)->exists();
            if ($exists) {
                continue;
            }

            $row['created_at'] = $now;
            DB::table('site_settings')->insert(array_merge($attrs, $row));
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('site_settings')) {
            return;
        }

        DB::table('site_settings')
            ->whereIn('key', array_column($this->keys, 'key'))
            ->delete();
    }
};
