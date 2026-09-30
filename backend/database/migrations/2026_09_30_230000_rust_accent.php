<?php

declare(strict_types=1);

use App\Domains\Content\ContentResolver;
use App\Models\SignageGroup;
use App\Models\SignagePlaylist;
use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Owner, 2026-09-30, shown the logo's rust next to the amber the site had
 * used: "Update the docs and change throughout the website."
 *
 * The accent everywhere becomes the rust the logo is mostly made of. The
 * primary colour setting drives the website, the order app and the
 * documents; a value still at the old amber (or empty) moves to the rust,
 * a colour the owner chose themself is left alone. Signage keeps its own
 * theme per playlist and group, on black, where the plain rust is too dim
 * to read, so those move to the lighter shade the dark theme derives.
 */
return new class extends Migration
{
    private const OLD_AMBER = '#D4813A';

    private const RUST = '#B74B0C';

    /** BrandPalette::forDarkSurface(RUST): the first tenth-step that clears 4.5:1 on the dark page. */
    private const RUST_ON_DARK = '#C56F3D';

    public function up(): void
    {
        if (Schema::hasTable('site_settings')) {
            $this->moveTheAccentSetting();
        }

        if (Schema::hasTable('signage_playlists')) {
            $this->moveSignageThemes();
        }

        SiteSetting::bust();
        if (class_exists(ContentResolver::class)) {
            ContentResolver::bust();
        }
    }

    public function down(): void
    {
        // The amber is not coming back by migration; Business Details can set any colour.
    }

    private function moveTheAccentSetting(): void
    {
        SiteSetting::query()
            ->where('key', 'primary_color')
            ->get()
            ->each(function (SiteSetting $row): void {
                $value = strtoupper(trim((string) $row->value));
                if ($value === '' || $value === self::OLD_AMBER) {
                    $row->value = self::RUST;
                    $row->save();
                }
            });

        // The record the website and documents read is the shared one; make
        // sure it exists on an install that never seeded it.
        $locales = SiteSetting::hasLocaleColumn() ? ['en', 'dv'] : ['en'];
        foreach ($locales as $locale) {
            $existing = SiteSetting::query()->where('key', 'primary_color');
            if (SiteSetting::hasScopeColumn()) {
                $existing->where('scope', 'shared');
            }
            if (SiteSetting::hasLocaleColumn()) {
                $existing->where('locale', $locale);
            }
            if (!$existing->exists()) {
                SiteSetting::set('primary_color', self::RUST, 'shared', $locale);
            }
        }
    }

    private function moveSignageThemes(): void
    {
        SignagePlaylist::query()->get()->each(function (SignagePlaylist $playlist): void {
            $theme = $this->themeMoved($playlist->theme);
            $slides = $this->slidesMoved($playlist->slides);
            if ($theme !== null || $slides !== null) {
                $playlist->forceFill(array_filter(['theme' => $theme, 'slides' => $slides], fn ($v) => $v !== null))->save();
            }
        });

        if (Schema::hasTable('signage_groups')) {
            SignageGroup::query()->get()->each(function (SignageGroup $group): void {
                $theme = $this->themeMoved($group->theme);
                if ($theme !== null) {
                    $group->forceFill(['theme' => $theme])->save();
                }
            });
        }
    }

    /** @return array<string, mixed>|null the theme with the accent moved, or null when nothing changes */
    private function themeMoved(mixed $theme): ?array
    {
        if (!is_array($theme)) {
            return null;
        }
        $primary = strtoupper(trim((string) ($theme['primary'] ?? '')));
        if ($primary !== self::OLD_AMBER) {
            return null;
        }
        $theme['primary'] = self::RUST_ON_DARK;

        return $theme;
    }

    /**
     * Seeded slides carry the accent in their element styles (eyebrows,
     * prices, the QR fill). Only that exact colour is touched.
     *
     * @return list<array<string, mixed>>|null
     */
    private function slidesMoved(mixed $slides): ?array
    {
        if (!is_array($slides)) {
            return null;
        }
        $json = json_encode($slides, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($json) || stripos($json, self::OLD_AMBER) === false) {
            return null;
        }
        $moved = json_decode(str_ireplace(self::OLD_AMBER, self::RUST_ON_DARK, $json), true);

        return is_array($moved) ? $moved : null;
    }
};
