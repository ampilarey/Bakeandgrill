<?php

declare(strict_types=1);

namespace App\Domains\Content\Blocks;

/**
 * Customer Surface Builder — editable surfaces for Website and Order App.
 * Placement records are per-app; device + slot live on each page_block.
 */
final class SurfaceCatalog
{
    public const APPS = ['website', 'order_app'];

    public const DEVICES = ['desktop', 'mobile'];

    public const SLOTS = ['header', 'home', 'footer', 'bottom_navigation'];

    /**
     * @return list<array{
     *   id: string,
     *   app: string,
     *   device: string,
     *   slot: string,
     *   label: string,
     *   description: string
     * }>
     */
    public static function all(): array
    {
        $surfaces = [];
        foreach (self::APPS as $app) {
            $appLabel = $app === 'website' ? 'Website' : 'Order App';
            foreach (self::DEVICES as $device) {
                $deviceLabel = $device === 'desktop' ? 'Desktop' : 'Mobile';
                foreach (self::slotsFor($app, $device) as $slot) {
                    $surfaces[] = [
                        'id' => self::id($app, $device, $slot),
                        'app' => $app,
                        'device' => $device,
                        'slot' => $slot,
                        'label' => $appLabel.' · '.$deviceLabel.' · '.self::slotLabel($slot),
                        'description' => self::slotDescription($app, $device, $slot),
                    ];
                }
            }
        }

        return $surfaces;
    }

    /**
     * Bottom navigation is mobile-only (phone chrome). Desktop has no bottom nav.
     *
     * @return list<string>
     */
    public static function slotsFor(string $app, string $device): array
    {
        if ($device === 'mobile') {
            return ['header', 'home', 'footer', 'bottom_navigation'];
        }

        return ['header', 'home', 'footer'];
    }

    public static function id(string $app, string $device, string $slot): string
    {
        return $app.'.'.$device.'.'.$slot;
    }

    public static function slotLabel(string $slot): string
    {
        return match ($slot) {
            'header' => 'Header',
            'home' => 'Home',
            'footer' => 'Footer',
            'bottom_navigation' => 'Bottom Navigation',
            default => $slot,
        };
    }

    public static function slotDescription(string $app, string $device, string $slot): string
    {
        $appLabel = $app === 'website' ? 'Website' : 'Order App';
        $deviceLabel = $device === 'desktop' ? 'desktop' : 'mobile';

        return match ($slot) {
            'header' => "Chrome at the top of the {$appLabel} {$deviceLabel} experience (logo row, prayer, announcements).",
            'home' => "Main {$appLabel} {$deviceLabel} home scroll — greeting, hero, offers, and other sections.",
            'footer' => "Content/branding footer (contact, legal, thanks) — not the same as bottom navigation.",
            'bottom_navigation' => "App tab bar (Menu, Orders, Account, …). Separate from the footer.",
            default => '',
        };
    }

    /**
     * Component types allowed on a given slot.
     *
     * @return list<string>
     */
    public static function typesForSlot(string $slot): array
    {
        $homeTypes = array_values(array_filter(
            BlockTypeRegistry::libraryTypes(),
            fn (string $t) => ! in_array($t, ['site_footer', 'bottom_nav'], true),
        ));

        return match ($slot) {
            'header' => ['prayer_bar', 'announcement', 'greeting', 'opening_status', 'service_availability', 'stat_chips'],
            'home' => $homeTypes,
            'footer' => ['site_footer', 'brand_footer', 'rich_text', 'button_band', 'divider', 'image', 'image_text'],
            'bottom_navigation' => ['bottom_nav'],
            default => $homeTypes,
        };
    }

    public static function isValidSurface(string $app, string $device, string $slot): bool
    {
        if (! in_array($app, self::APPS, true) || ! in_array($device, self::DEVICES, true)) {
            return false;
        }

        return in_array($slot, self::slotsFor($app, $device), true);
    }
}
