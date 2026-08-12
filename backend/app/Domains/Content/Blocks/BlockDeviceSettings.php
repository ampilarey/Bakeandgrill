<?php

declare(strict_types=1);

namespace App\Domains\Content\Blocks;

/**
 * Per-instance desktop/mobile visibility and placement (home vs header).
 * Stored inside page_blocks.settings — sharing content does not share these.
 */
final class BlockDeviceSettings
{
    public const SCHEMA = [
        'show_desktop' => 'nullable|boolean',
        'show_mobile' => 'nullable|boolean',
        'placement_desktop' => 'nullable|in:home,header',
        'placement_mobile' => 'nullable|in:home,header',
    ];

    public const DEFAULTS = [
        'show_desktop' => true,
        'show_mobile' => true,
        'placement_desktop' => 'home',
        'placement_mobile' => 'home',
    ];

    /**
     * @param  array<string, mixed>  $settings
     */
    public static function showDesktop(array $settings): bool
    {
        return array_key_exists('show_desktop', $settings)
            ? (bool) $settings['show_desktop']
            : true;
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    public static function showMobile(array $settings): bool
    {
        return array_key_exists('show_mobile', $settings)
            ? (bool) $settings['show_mobile']
            : true;
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    public static function placementDesktop(array $settings): string
    {
        $v = $settings['placement_desktop'] ?? 'home';

        return in_array($v, ['home', 'header'], true) ? $v : 'home';
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    public static function placementMobile(array $settings): string
    {
        $v = $settings['placement_mobile'] ?? 'home';

        return in_array($v, ['home', 'header'], true) ? $v : 'home';
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    public static function visibleOnDevice(array $settings, string $device): bool
    {
        return $device === 'desktop'
            ? self::showDesktop($settings)
            : self::showMobile($settings);
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    public static function placementOnDevice(array $settings, string $device): string
    {
        return $device === 'desktop'
            ? self::placementDesktop($settings)
            : self::placementMobile($settings);
    }

    /**
     * Defaults specialised for prayer (preserve intended chrome).
     *
     * @return array<string, mixed>
     */
    public static function prayerDefaults(string $app): array
    {
        if ($app === 'website') {
            return [
                'show_desktop' => true,
                'show_mobile' => true,
                'placement_desktop' => 'header',
                'placement_mobile' => 'header',
            ];
        }

        return [
            'show_desktop' => true,
            'show_mobile' => true,
            'placement_desktop' => 'header',
            'placement_mobile' => 'home',
        ];
    }

    /**
     * Defaults for announcement (header chrome historically).
     *
     * @return array<string, mixed>
     */
    public static function announcementDefaults(): array
    {
        return [
            'show_desktop' => true,
            'show_mobile' => true,
            'placement_desktop' => 'header',
            'placement_mobile' => 'header',
        ];
    }
}
