<?php

declare(strict_types=1);

namespace App\Domains\Signage\Services;

/**
 * Normalizes Stage-3 single-banner and Stage-4 multi-banner shapes to one list.
 *
 * @phpstan-type BannerSchedule array{
 *   date_start?: string|null,
 *   date_end?: string|null,
 *   days?: list<int>|null,
 *   windows?: list<array{start: string, end: string}>|null
 * }
 * @phpstan-type BannerItem array{
 *   id: string,
 *   label: string,
 *   enabled: bool,
 *   position: string,
 *   fields: list<string>,
 *   custom_text: string,
 *   speed_seconds: int,
 *   duration_seconds: int,
 *   repeat_count: int,
 *   font_scale: float,
 *   height_scale: float,
 *   text_color: string,
 *   background_color: string,
 *   align: string,
 *   scroll_mode: string,
 *   direction: string,
 *   date_format: string,
 *   inset_percent: float,
 *   schedule: BannerSchedule|null
 * }
 * @phpstan-type BannerSettings array{
 *   enabled: bool,
 *   show_logo_between: bool,
 *   banners: list<BannerItem>
 * }
 */
final class SignageBannerNormalizer
{
    private const ALLOWED_FIELDS = ['date', 'time', 'next_prayer', 'countdown', 'all_prayers'];

    public const SPEED_MIN = 5;

    public const SPEED_MAX = 180;

    private const ALLOWED_DATE_FORMATS = ['full', 'short', 'numeric', 'weekday', 'hijri'];

    private const ALLOWED_ALIGNS = ['left', 'center', 'right'];

    private const ALLOWED_SCROLL_MODES = ['ticker', 'seamless', 'static'];

    private const ALLOWED_DIRECTIONS = ['ltr', 'rtl'];

    private const DEFAULT_TEXT_COLOR = '#fff8f0';

    private const DEFAULT_BG_COLOR = 'rgba(12, 8, 4, 0.78)';

    /** Product default when neither scroll_mode nor scroll is present. Must match BANNER_APPEARANCE_DEFAULTS.scroll_mode. */
    public const DEFAULT_SCROLL_MODE = 'ticker';

    /**
     * @param  mixed  $raw
     * @return BannerSettings
     */
    public static function normalize(mixed $raw): array
    {
        $cfg = is_string($raw) ? (json_decode($raw, true) ?: []) : (is_array($raw) ? $raw : []);
        $masterEnabled = (bool) ($cfg['enabled'] ?? false);
        $showLogoBetween = ($cfg['show_logo_between'] ?? false) === true;

        if (isset($cfg['banners']) && is_array($cfg['banners'])) {
            $banners = [];
            foreach (array_values($cfg['banners']) as $i => $item) {
                if (! is_array($item)) {
                    continue;
                }
                $banners[] = self::normalizeItem($item, $i);
            }
            if ($banners === []) {
                $banners[] = self::normalizeItem([
                    'id' => 'default',
                    'label' => 'Prayer',
                    'enabled' => true,
                    'position' => 'bottom',
                    'fields' => self::ALLOWED_FIELDS,
                    'speed_seconds' => 40,
                    'duration_seconds' => 30,
                    'scroll_mode' => self::DEFAULT_SCROLL_MODE,
                    'repeat_count' => 1,
                ], 0);
            }

            return [
                'enabled' => $masterEnabled,
                'show_logo_between' => $showLogoBetween,
                'banners' => $banners,
            ];
        }

        $hasLegacy = array_key_exists('position', $cfg)
            || array_key_exists('fields', $cfg)
            || array_key_exists('speed_seconds', $cfg)
            || array_key_exists('enabled', $cfg);

        if ($hasLegacy) {
            return [
                'enabled' => $masterEnabled,
                'show_logo_between' => $showLogoBetween,
                'banners' => [self::normalizeItem([
                    'id' => 'legacy',
                    'label' => 'Info',
                    'enabled' => true,
                    'position' => $cfg['position'] ?? 'bottom',
                    'fields' => $cfg['fields'] ?? self::ALLOWED_FIELDS,
                    'speed_seconds' => $cfg['speed_seconds'] ?? 40,
                    'duration_seconds' => 30,
                ], 0)],
            ];
        }

        return [
            'enabled' => false,
            'show_logo_between' => false,
            'banners' => [self::normalizeItem([
                'id' => 'default',
                'label' => 'Prayer',
                'enabled' => true,
                'position' => 'bottom',
                'fields' => self::ALLOWED_FIELDS,
                'speed_seconds' => 40,
                'duration_seconds' => 30,
                'scroll_mode' => self::DEFAULT_SCROLL_MODE,
                'repeat_count' => 1,
            ], 0)],
        ];
    }

    /**
     * @param  array<string, mixed>  $raw
     * @return BannerItem
     */
    public static function normalizeItem(array $raw, int $fallbackIndex = 0): array
    {
        $fields = $raw['fields'] ?? self::ALLOWED_FIELDS;
        if (! is_array($fields)) {
            $fields = self::ALLOWED_FIELDS;
        }
        $fields = array_values(array_filter(
            array_map('strval', $fields),
            fn (string $f) => in_array($f, self::ALLOWED_FIELDS, true)
        ));
        if ($fields === []) {
            $fields = self::ALLOWED_FIELDS;
        }

        $position = (string) ($raw['position'] ?? 'bottom');
        if (! in_array($position, ['top', 'bottom'], true)) {
            $position = 'bottom';
        }

        $speed = (int) ($raw['speed_seconds'] ?? 40);
        if ($speed < self::SPEED_MIN) {
            $speed = self::SPEED_MIN;
        }
        if ($speed > self::SPEED_MAX) {
            $speed = self::SPEED_MAX;
        }

        $duration = (int) ($raw['duration_seconds'] ?? 30);
        if ($duration < 5) {
            $duration = 5;
        }
        if ($duration > 600) {
            $duration = 600;
        }

        $repeatCount = (int) ($raw['repeat_count'] ?? 1);
        if ($repeatCount < 1) {
            $repeatCount = 1;
        }
        if ($repeatCount > 20) {
            $repeatCount = 20;
        }

        $fontScale = self::clampScale($raw['font_scale'] ?? 1.0);
        $heightScale = self::clampScale($raw['height_scale'] ?? 1.0);

        $dateFormat = (string) ($raw['date_format'] ?? 'full');
        if (! in_array($dateFormat, self::ALLOWED_DATE_FORMATS, true)) {
            $dateFormat = 'full';
        }

        $align = (string) ($raw['align'] ?? 'left');
        if (! in_array($align, self::ALLOWED_ALIGNS, true)) {
            $align = 'left';
        }

        $direction = (string) ($raw['direction'] ?? 'ltr');
        if (! in_array($direction, self::ALLOWED_DIRECTIONS, true)) {
            $direction = 'ltr';
        }

        $inset = (float) ($raw['inset_percent'] ?? 0);
        if ($inset < 0) {
            $inset = 0.0;
        }
        if ($inset > 5) {
            $inset = 5.0;
        }
        $inset = round($inset, 1);

        return [
            'id' => (string) ($raw['id'] ?? ('legacy-'.$fallbackIndex)),
            'label' => (string) ($raw['label'] ?? ('Banner '.($fallbackIndex + 1))),
            'enabled' => ($raw['enabled'] ?? true) !== false,
            'position' => $position,
            'fields' => $fields,
            'custom_text' => (string) ($raw['custom_text'] ?? ''),
            'speed_seconds' => $speed,
            'duration_seconds' => $duration,
            'repeat_count' => $repeatCount,
            'font_scale' => $fontScale,
            'height_scale' => $heightScale,
            'text_color' => self::normalizeColor($raw['text_color'] ?? null, self::DEFAULT_TEXT_COLOR),
            'background_color' => self::normalizeColor($raw['background_color'] ?? null, self::DEFAULT_BG_COLOR),
            'align' => $align,
            'scroll_mode' => self::normalizeScrollMode($raw),
            'direction' => $direction,
            'date_format' => $dateFormat,
            'inset_percent' => $inset,
            'schedule' => self::normalizeSchedule($raw['schedule'] ?? null),
        ];
    }

    /**
     * @param  array<string, mixed>  $raw
     */
    public static function normalizeScrollMode(array $raw): string
    {
        $mode = (string) ($raw['scroll_mode'] ?? '');
        if (in_array($mode, self::ALLOWED_SCROLL_MODES, true)) {
            return $mode;
        }
        if (array_key_exists('scroll', $raw)) {
            return ($raw['scroll'] ?? true) === false ? 'static' : 'seamless';
        }

        // No scroll_mode / scroll key → product default.
        return self::DEFAULT_SCROLL_MODE;
    }

    /**
     * @param  mixed  $raw
     * @return BannerSchedule|null
     */
    public static function normalizeSchedule(mixed $raw): ?array
    {
        if (! is_array($raw)) {
            return null;
        }
        $hasAny = array_key_exists('date_start', $raw)
            || array_key_exists('date_end', $raw)
            || array_key_exists('days', $raw)
            || array_key_exists('windows', $raw);
        if (! $hasAny) {
            return null;
        }

        $schedule = [];
        if (array_key_exists('date_start', $raw) && $raw['date_start'] !== null && $raw['date_start'] !== '') {
            $schedule['date_start'] = (string) $raw['date_start'];
        }
        if (array_key_exists('date_end', $raw) && $raw['date_end'] !== null && $raw['date_end'] !== '') {
            $schedule['date_end'] = (string) $raw['date_end'];
        }
        if (isset($raw['days']) && is_array($raw['days']) && $raw['days'] !== []) {
            $schedule['days'] = array_values(array_map('intval', $raw['days']));
        }
        if (isset($raw['windows']) && is_array($raw['windows']) && $raw['windows'] !== []) {
            $windows = [];
            foreach ($raw['windows'] as $window) {
                if (! is_array($window)) {
                    continue;
                }
                $windows[] = [
                    'start' => (string) ($window['start'] ?? '00:00'),
                    'end' => (string) ($window['end'] ?? '23:59'),
                ];
            }
            if ($windows !== []) {
                $schedule['windows'] = $windows;
            }
        }

        return $schedule === [] ? null : $schedule;
    }

    private static function clampScale(mixed $raw): float
    {
        $v = is_numeric($raw) ? (float) $raw : 1.0;
        if ($v < 0.5) {
            $v = 0.5;
        }
        if ($v > 3.0) {
            $v = 3.0;
        }

        return round($v, 2);
    }

    private static function normalizeColor(mixed $raw, string $fallback): string
    {
        if (! is_string($raw)) {
            return $fallback;
        }
        $s = trim($raw);
        if ($s === '' || strlen($s) > 80) {
            return $fallback;
        }
        if (preg_match('/^#([0-9a-fA-F]{3,8})$/', $s)) {
            return $s;
        }
        if (preg_match('/^(rgba?|hsla?)\(/i', $s)) {
            return $s;
        }
        if (preg_match('/^[a-zA-Z]+$/', $s)) {
            return $s;
        }

        return $fallback;
    }
}
