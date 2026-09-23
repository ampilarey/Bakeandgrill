<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Board layout pass, 2026-09-23 — bring the seeded defaults up to date.
 *
 * The default playlist was seeded with `font_display: Georgia, serif` and
 * `font_body: system-ui, sans-serif`, so the board never used the brand
 * face the menu and the apps ship with. Its auto-menu entry was seeded
 * with thumbnails off and a showcase cap of 12, which — once every dish had
 * a photo — made the loop a dozen close-ups and no price list.
 *
 * Only values still at the seeded defaults change; anything the owner has
 * set by hand stays. Blank fonts fall back to the brand faces in the
 * renderer.
 */
return new class extends Migration
{
    private const SEEDED_FONTS = [
        'font_display' => 'Georgia, serif',
        'font_body' => 'system-ui, sans-serif',
    ];

    public function up(): void
    {
        if (!Schema::hasTable('signage_playlists')) {
            return;
        }

        foreach (DB::table('signage_playlists')->get(['id', 'theme', 'slides']) as $row) {
            $theme = self::decode($row->theme);
            $slides = self::decode($row->slides);
            $changed = false;

            foreach (self::SEEDED_FONTS as $key => $seeded) {
                if (($theme[$key] ?? null) === $seeded) {
                    $theme[$key] = '';
                    $changed = true;
                }
            }

            foreach ($slides as &$slide) {
                if (($slide['template_origin'] ?? null) !== 'auto_menu' || !isset($slide['elements'][0])) {
                    continue;
                }
                $binding = is_array($slide['elements'][0]['binding'] ?? null) ? $slide['elements'][0]['binding'] : [];
                if (($binding['show_thumbs'] ?? null) === false) {
                    $binding['show_thumbs'] = true;
                    $changed = true;
                }
                if (($binding['showcase_cap'] ?? null) === 12) {
                    $binding['showcase_cap'] = 6;
                    $changed = true;
                }
                $slide['elements'][0]['binding'] = $binding;
            }
            unset($slide);

            if ($changed) {
                DB::table('signage_playlists')->where('id', $row->id)->update([
                    'theme' => json_encode($theme, JSON_UNESCAPED_UNICODE),
                    'slides' => json_encode($slides, JSON_UNESCAPED_UNICODE),
                ]);
            }
        }

        // Resolved configs are cached by playlist version — make them rebuild.
        if (class_exists(App\Domains\Signage\Services\SignageCache::class)) {
            try {
                App\Domains\Signage\Services\SignageCache::bust();
            } catch (Throwable) {
                // No cache in reach during a fresh install — nothing to bust.
            }
        }
    }

    public function down(): void
    {
        // Presentation defaults only; nothing to restore.
    }

    /** @return array<mixed> */
    private static function decode(mixed $json): array
    {
        if (is_array($json)) {
            return $json;
        }
        $decoded = is_string($json) && $json !== '' ? json_decode($json, true) : null;

        return is_array($decoded) ? $decoded : [];
    }
};
