<?php

declare(strict_types=1);

use App\Domains\Content\ContentRegistry;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Seed Order App "Status banners" content keys with today's exact wording defaults.
 * Additive — registry defaults also cover empty rows via ContentResolver.
 *
 * Note (2026-07): order_status_* keys were retired from config/content.php (unused;
 * live badges use order_hours_*). Historical seed rows may remain — do not delete.
 */
return new class extends Migration
{
    /** @var list<string> */
    private const KEYS = [
        'order_status_open',
        'order_status_closed',
        'order_status_pickup_only',
        'order_status_closes',
        'order_status_opens',
        'order_status_delivery_from',
        'order_hours_open',
        'order_hours_closed',
        'order_hours_open_closes',
        'order_hours_closed_opens',
    ];

    public function up(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }

        $hasLocale = Schema::hasColumn('site_settings', 'locale');
        $hasScope = Schema::hasColumn('site_settings', 'scope');
        $now = now();

        foreach (self::KEYS as $key) {
            if (!ContentRegistry::has($key)) {
                continue;
            }
            $block = ContentRegistry::block($key) ?? [];
            $attrs = [
                'key' => $key,
                'value' => (string) ($block['default'] ?? ''),
                'type' => (string) ($block['type'] ?? 'text'),
                'group' => (string) ($block['group'] ?? 'Status banners'),
                'label' => (string) ($block['label'] ?? $key),
                'description' => null,
                'is_public' => (bool) ($block['public'] ?? true),
                'updated_at' => $now,
            ];
            if ($hasScope) {
                $attrs['scope'] = 'order_app';
            }
            if ($hasLocale) {
                $attrs['locale'] = 'en';
            }

            $query = DB::table('site_settings')->where('key', $key);
            if ($hasScope) {
                $query->where('scope', 'order_app');
            }
            if ($hasLocale) {
                $query->where('locale', 'en');
            }

            if ($query->exists()) {
                continue;
            }

            $attrs['created_at'] = $now;
            DB::table('site_settings')->insert($attrs);
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }

        $query = DB::table('site_settings')->whereIn('key', self::KEYS);
        if (Schema::hasColumn('site_settings', 'scope')) {
            $query->where('scope', 'order_app');
        }
        $query->delete();
    }
};
