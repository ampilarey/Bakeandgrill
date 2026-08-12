<?php

declare(strict_types=1);

namespace App\Domains\Content\Blocks;

use App\Models\PageBlock;
use Illuminate\Support\Collection;

/**
 * Resolve header-owned Home chrome (prayer, announcement) from page_blocks.
 * Sharing content never forces visibility — each app instance is checked alone.
 */
final class HomeChromeResolver
{
    /**
     * @return array{
     *   enabled: bool,
     *   show_desktop: bool,
     *   show_mobile: bool,
     *   placement_desktop: string,
     *   placement_mobile: string,
     *   settings: array<string, mixed>
     * }
     */
    public static function resolve(string $app, string $blockType, ?Collection $blocks = null): array
    {
        $blocks ??= PageBlockRepository::forPage($app);
        $defaults = match ($blockType) {
            'prayer_bar' => BlockDeviceSettings::prayerDefaults($app),
            'announcement' => BlockDeviceSettings::announcementDefaults(),
            default => BlockDeviceSettings::DEFAULTS,
        };

        /** @var PageBlock|null $any */
        $any = $blocks->first(fn (PageBlock $b) => $b->block_type === $blockType);
        /** @var PageBlock|null $block */
        $block = $blocks->first(
            fn (PageBlock $b) => $b->block_type === $blockType && $b->is_enabled,
        );

        // Before the shared-home migration, prayer/announcement may not exist as
        // page_blocks. Preserve the historical header experience until a row exists.
        if ($any === null && in_array($blockType, ['prayer_bar', 'announcement'], true)) {
            $legacyOn = $blockType === 'prayer_bar'
                ? true
                : (string) \App\Models\SiteSetting::get('announcement_enabled', 'false') === 'true';

            return [
                'enabled' => $legacyOn,
                'show_desktop' => $legacyOn,
                'show_mobile' => $legacyOn,
                'placement_desktop' => $defaults['placement_desktop'],
                'placement_mobile' => $defaults['placement_mobile'],
                'settings' => $defaults,
            ];
        }

        if ($block === null) {
            return [
                'enabled' => false,
                'show_desktop' => false,
                'show_mobile' => false,
                'placement_desktop' => $defaults['placement_desktop'],
                'placement_mobile' => $defaults['placement_mobile'],
                'settings' => $defaults,
            ];
        }

        $settings = array_merge($defaults, $block->resolvedSettings());

        return [
            'enabled' => true,
            'show_desktop' => BlockDeviceSettings::showDesktop($settings),
            'show_mobile' => BlockDeviceSettings::showMobile($settings),
            'placement_desktop' => BlockDeviceSettings::placementDesktop($settings),
            'placement_mobile' => BlockDeviceSettings::placementMobile($settings),
            'settings' => $settings,
        ];
    }

    public static function showInHeader(string $app, string $blockType, string $device, ?Collection $blocks = null): bool
    {
        $chrome = self::resolve($app, $blockType, $blocks);
        if (! $chrome['enabled']) {
            return false;
        }
        if (! BlockDeviceSettings::visibleOnDevice($chrome['settings'], $device)) {
            return false;
        }

        return BlockDeviceSettings::placementOnDevice($chrome['settings'], $device) === 'header';
    }

    public static function showInHome(string $app, string $blockType, string $device, ?Collection $blocks = null): bool
    {
        $chrome = self::resolve($app, $blockType, $blocks);
        if (! $chrome['enabled']) {
            return false;
        }
        if (! BlockDeviceSettings::visibleOnDevice($chrome['settings'], $device)) {
            return false;
        }

        return BlockDeviceSettings::placementOnDevice($chrome['settings'], $device) === 'home';
    }
}
