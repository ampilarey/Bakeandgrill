<?php

use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * One-time visual migration: legacy seamless / scroll:true banners become ticker.
 *
 * Deliberate behaviour change — existing seamless loops switch to single-pass ticker.
 */
return new class extends Migration
{
    public function up(): void
    {
        $row = DB::table('site_settings')->where('key', 'signage_banner')->first();
        if (! $row || ! is_string($row->value) || $row->value === '') {
            return;
        }

        $cfg = json_decode($row->value, true);
        if (! is_array($cfg)) {
            return;
        }

        $changed = false;

        if (! array_key_exists('show_logo_between', $cfg)) {
            $cfg['show_logo_between'] = false;
            $changed = true;
        }

        if (! isset($cfg['banners']) || ! is_array($cfg['banners'])) {
            if ($changed) {
                $this->persist($cfg);
            }

            return;
        }

        foreach ($cfg['banners'] as $i => $banner) {
            if (! is_array($banner)) {
                continue;
            }

            $scrollMode = isset($banner['scroll_mode']) ? (string) $banner['scroll_mode'] : '';
            $hasScrollKey = array_key_exists('scroll', $banner);
            $scrollVal = $banner['scroll'] ?? null;

            $shouldTicker = $scrollMode === 'seamless'
                || ($scrollMode === '' && (! $hasScrollKey || $scrollVal !== false))
                || $scrollVal === true;

            if ($shouldTicker) {
                $banner['scroll_mode'] = 'ticker';
                unset($banner['scroll']);
                $changed = true;
            }

            if (! array_key_exists('repeat_count', $banner)) {
                $banner['repeat_count'] = 1;
                $changed = true;
            } else {
                $repeat = (int) $banner['repeat_count'];
                $banner['repeat_count'] = max(1, min(20, $repeat));
            }

            if (! array_key_exists('direction', $banner)) {
                $banner['direction'] = 'ltr';
                $changed = true;
            } elseif (! in_array((string) $banner['direction'], ['ltr', 'rtl'], true)) {
                $banner['direction'] = 'ltr';
                $changed = true;
            }

            $cfg['banners'][$i] = $banner;
        }

        if ($changed) {
            $this->persist($cfg);
            SiteSetting::bust();
        }
    }

    public function down(): void
    {
        // Intentionally irreversible — seamless→ticker is a deliberate visual change.
    }

    /** @param array<string, mixed> $cfg */
    private function persist(array $cfg): void
    {
        $encoded = json_encode($cfg, JSON_UNESCAPED_UNICODE);
        $attrs = ['key' => 'signage_banner'];
        if (Schema::hasColumn('site_settings', 'scope')) {
            $attrs['scope'] = 'shared';
        }
        if (Schema::hasColumn('site_settings', 'locale')) {
            $attrs['locale'] = 'en';
        }

        DB::table('site_settings')->updateOrInsert(
            $attrs,
            [
                'value' => $encoded,
                'type' => 'json',
                'group' => 'Signage',
                'label' => 'Signage banner',
                'is_public' => false,
                'updated_at' => now(),
            ]
        );
    }
};
