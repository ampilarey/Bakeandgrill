<?php

declare(strict_types=1);

namespace App\Domains\Signage\Services;

/**
 * Normalizes Stage-3 single-banner and Stage-4 multi-banner shapes to one list.
 *
 * @phpstan-type BannerItem array{
 *   id: string,
 *   label: string,
 *   enabled: bool,
 *   position: string,
 *   fields: list<string>,
 *   custom_text: string,
 *   speed_seconds: int,
 *   duration_seconds: int
 * }
 * @phpstan-type BannerSettings array{enabled: bool, banners: list<BannerItem>}
 */
final class SignageBannerNormalizer
{
    private const ALLOWED_FIELDS = ['date', 'time', 'next_prayer', 'countdown'];

    /**
     * @param  mixed  $raw
     * @return BannerSettings
     */
    public static function normalize(mixed $raw): array
    {
        $cfg = is_string($raw) ? (json_decode($raw, true) ?: []) : (is_array($raw) ? $raw : []);
        $masterEnabled = (bool) ($cfg['enabled'] ?? false);

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
                ], 0);
            }

            return ['enabled' => $masterEnabled, 'banners' => $banners];
        }

        $hasLegacy = array_key_exists('position', $cfg)
            || array_key_exists('fields', $cfg)
            || array_key_exists('speed_seconds', $cfg)
            || array_key_exists('enabled', $cfg);

        if ($hasLegacy) {
            return [
                'enabled' => $masterEnabled,
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
            'banners' => [self::normalizeItem([
                'id' => 'default',
                'label' => 'Prayer',
                'enabled' => true,
                'position' => 'bottom',
                'fields' => self::ALLOWED_FIELDS,
                'speed_seconds' => 40,
                'duration_seconds' => 30,
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
        if ($speed < 10) {
            $speed = 10;
        }
        if ($speed > 180) {
            $speed = 180;
        }

        $duration = (int) ($raw['duration_seconds'] ?? 30);
        if ($duration < 5) {
            $duration = 5;
        }
        if ($duration > 600) {
            $duration = 600;
        }

        return [
            'id' => (string) ($raw['id'] ?? ('legacy-'.$fallbackIndex)),
            'label' => (string) ($raw['label'] ?? ('Banner '.($fallbackIndex + 1))),
            'enabled' => ($raw['enabled'] ?? true) !== false,
            'position' => $position,
            'fields' => $fields,
            'custom_text' => (string) ($raw['custom_text'] ?? ''),
            'speed_seconds' => $speed,
            'duration_seconds' => $duration,
        ];
    }
}
