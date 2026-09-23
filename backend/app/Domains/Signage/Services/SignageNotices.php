<?php

declare(strict_types=1);

namespace App\Domains\Signage\Services;

use App\Models\SiteSetting;
use Carbon\Carbon;
use Illuminate\Support\Str;

/**
 * Quick notices for the TV board (owner's shortlist, 2026-09-23).
 *
 * "Kitchen closes in 20 min", "Fresh hedhikaa at 4" — posted from the
 * admin phone in three taps, without opening the designer. A notice can
 * run as a line on the ticker, as a full slide in the rotation, or both,
 * and expires by itself. Stored in one site setting; the resolver puts the
 * live ones into the board config and the board drops each the minute it
 * expires, whatever the cache says.
 */
final class SignageNotices
{
    public const SETTING = 'signage_notices';

    public const LOOKS = ['info', 'warning', 'celebrate'];

    public const SHOWS = ['ticker', 'slide', 'both'];

    /** @return list<array<string, mixed>> Every notice still on file, expired ones pruned. */
    public static function all(?Carbon $now = null): array
    {
        $now = $now ?? now();
        $raw = SiteSetting::get(self::SETTING, '{}');
        $data = is_string($raw) ? (json_decode($raw, true) ?: []) : (is_array($raw) ? $raw : []);
        $items = is_array($data['items'] ?? null) ? $data['items'] : [];

        return array_values(array_filter(
            array_map(static fn ($n) => is_array($n) ? self::normalize($n) : null, $items),
            static fn (?array $n) => $n !== null && !self::expired($n, $now),
        ));
    }

    /** @return list<array<string, mixed>> */
    public static function active(?Carbon $now = null): array
    {
        return self::all($now);
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed> The notice as stored.
     */
    public static function add(array $input, ?Carbon $now = null): array
    {
        $now = $now ?? now();
        $notice = self::normalize(array_merge($input, [
            'id' => 'n-' . Str::lower(Str::random(10)),
            'created_at' => $now->toIso8601String(),
        ]));
        $items = self::all($now);
        $items[] = $notice;
        self::store($items);

        return $notice;
    }

    public static function remove(string $id, ?Carbon $now = null): bool
    {
        $items = self::all($now);
        $kept = array_values(array_filter($items, static fn (array $n) => $n['id'] !== $id));
        self::store($kept);

        return count($kept) !== count($items);
    }

    /** @param  list<array<string, mixed>>  $items */
    private static function store(array $items): void
    {
        SiteSetting::set(self::SETTING, ['items' => array_values($items)]);
        SiteSetting::bust();
        SignageCache::bust();
    }

    /**
     * @param array<string, mixed> $raw
     * @return array<string, mixed>
     */
    public static function normalize(array $raw): array
    {
        $look = (string) ($raw['look'] ?? 'info');
        $show = (string) ($raw['show'] ?? 'both');
        $seconds = (int) ($raw['seconds'] ?? 8);
        $expires = $raw['expires_at'] ?? null;
        $expiresAt = null;
        if (is_string($expires) && $expires !== '') {
            try {
                $expiresAt = Carbon::parse($expires)->toIso8601String();
            } catch (\Throwable) {
                $expiresAt = null;
            }
        }

        return [
            'id' => (string) ($raw['id'] ?? ''),
            'text' => trim((string) ($raw['text'] ?? '')),
            'text_dv' => trim((string) ($raw['text_dv'] ?? '')),
            'look' => in_array($look, self::LOOKS, true) ? $look : 'info',
            'show' => in_array($show, self::SHOWS, true) ? $show : 'both',
            'seconds' => max(4, min(60, $seconds ?: 8)),
            'created_at' => (string) ($raw['created_at'] ?? ''),
            'expires_at' => $expiresAt,
        ];
    }

    /** @param  array<string, mixed>  $notice */
    public static function expired(array $notice, Carbon $now): bool
    {
        $at = $notice['expires_at'] ?? null;
        if (!is_string($at) || $at === '') {
            return false;
        }
        try {
            return Carbon::parse($at)->lte($now);
        } catch (\Throwable) {
            return false;
        }
    }

    /**
     * The full-screen slide for a notice: eyebrow, the message (with its
     * Dhivehi beside it), logo and clock, on a background that says what
     * kind of notice it is. Carries `expires_at` so the board can drop it
     * on time.
     *
     * @param array<string, mixed> $notice
     * @return array<string, mixed>
     */
    public static function slide(array $notice): array
    {
        [$background, $eyebrow, $accent, $text] = match ($notice['look']) {
            'warning' => [['type' => 'solid', 'value' => '#7A1F1F', 'opacity' => 1], 'Please note', '#FFD3A8', '#FFF8F0'],
            'celebrate' => [['type' => 'gradient', 'value' => 'linear-gradient(135deg,#B8651F,#D4813A 55%,#F2B266)', 'opacity' => 1], 'Today', '#FFF8F0', '#1C1408'],
            default => [['type' => 'solid', 'value' => '#1C1408', 'opacity' => 1], 'Notice', '#D4813A', '#FFF8F0'],
        };

        return [
            'id' => 'notice-' . $notice['id'],
            'name' => 'Notice: ' . Str::limit($notice['text'], 40),
            'seconds' => (int) $notice['seconds'],
            'weight' => 2,
            'transition' => 'fade',
            'transition_ms' => 600,
            'background' => $background,
            'template_origin' => 'notice:' . $notice['look'],
            'expires_at' => $notice['expires_at'],
            'elements' => [
                SignageTemplateFactory::el('text', 8, 24, 84, 8, [
                    'text' => $eyebrow,
                    'style' => ['fontSize' => 2.6, 'fontWeight' => 700, 'color' => $accent, 'letterSpacing' => 0.16, 'textTransform' => 'uppercase', 'textAlign' => 'center'],
                    'animation' => ['entrance' => 'fade', 'duration' => 600],
                ]),
                SignageTemplateFactory::el('text', 8, 34, 84, 40, [
                    'text' => $notice['text'],
                    'text_dv' => $notice['text_dv'] !== '' ? $notice['text_dv'] : null,
                    'style' => ['fontSize' => 6.4, 'fontWeight' => 800, 'color' => $text, 'textAlign' => 'center', 'fontFamily' => 'display'],
                    'animation' => ['entrance' => 'rise', 'duration' => 700, 'delay' => 120],
                ]),
                SignageTemplateFactory::el('logo', 86, 3, 10, 9, []),
                SignageTemplateFactory::el('clock', 78, 91, 18, 6, [
                    'style' => ['fontSize' => 2.2, 'color' => $accent, 'textAlign' => 'right'],
                ]),
            ],
        ];
    }

    /**
     * The ticker line for a notice, ahead of the owner's own banners.
     *
     * @param array<string, mixed> $notice
     * @return array<string, mixed>
     */
    public static function bannerItem(array $notice): array
    {
        $bg = match ($notice['look']) {
            'warning' => 'rgba(122, 31, 31, 0.92)',
            'celebrate' => 'rgba(212, 129, 58, 0.92)',
            default => 'rgba(12, 8, 4, 0.82)',
        };
        $text = $notice['text'] . ($notice['text_dv'] !== '' ? '   ·   ' . $notice['text_dv'] : '');

        return SignageBannerNormalizer::normalizeItem([
            'id' => 'notice-' . $notice['id'],
            'label' => 'Notice',
            'enabled' => true,
            'position' => 'bottom',
            'custom_text' => $text,
            'speed_seconds' => 40,
            // A short line clears the screen in a few seconds; two passes
            // before the ticker moves on give it a chance to be read.
            'repeat_count' => 2,
            'font_scale' => 1.15,
            'text_color' => $notice['look'] === 'celebrate' ? '#1C1408' : '#FFF8F0',
            'background_color' => $bg,
            'scroll_mode' => 'seamless',
            'expires_at' => $notice['expires_at'],
        ]) + ['expires_at' => $notice['expires_at']];
    }
}
