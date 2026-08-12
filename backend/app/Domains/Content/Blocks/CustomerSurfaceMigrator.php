<?php

declare(strict_types=1);

namespace App\Domains\Content\Blocks;

use App\Models\PageBlock;
use Illuminate\Support\Facades\DB;

/**
 * Ensures every live install has explicit surface placement rows for chrome
 * that used to be hard-coded (prayer, trust, events, site footer, bottom nav).
 * Does not invent customer-visible sections that were never on that app.
 */
final class CustomerSurfaceMigrator
{
    public static function migrate(): void
    {
        DB::transaction(function () {
            self::ensureWebsiteChrome();
            self::ensureOrderAppChrome();
            PageBlockRepository::bustAll();
        });
    }

    private static function ensureWebsiteChrome(): void
    {
        $app = PageBlock::APP_WEBSITE;
        self::ensureBlock($app, 'prayer_bar', BlockDeviceSettings::prayerDefaults('website'), 0);
        // Placement chrome is on by default; announcement_enabled content key still
        // gates whether the banner text is shown (see layout.blade.php).
        self::ensureBlock($app, 'announcement', BlockDeviceSettings::announcementDefaults(), 1, enabled: true);
        // Match order-app home: hero → mode cards → trust strip.
        self::ensureBlock($app, 'mode_cards', BlockDeviceSettings::DEFAULTS, afterType: 'hero');
        self::ensureBlock($app, 'trust_strip', BlockDeviceSettings::DEFAULTS, afterType: 'mode_cards');
        self::ensureBlock($app, 'events_band', BlockDeviceSettings::DEFAULTS, append: true);
        self::ensureBlock($app, 'site_footer', [
            'show_desktop' => true,
            'show_mobile' => true,
            'placement_desktop' => 'footer',
            'placement_mobile' => 'footer',
            'layout' => 'full',
        ], append: true);
        self::ensureBlock($app, 'bottom_nav', [
            'show_desktop' => false,
            'show_mobile' => true,
            'placement_desktop' => 'bottom_navigation',
            'placement_mobile' => 'bottom_navigation',
            'tabs' => self::defaultWebsiteBottomNavTabs(),
        ], append: true);
        // Brand footer on website home was historically ignored by the walker —
        // do not auto-add it. Admins can add it via the Surface Builder.
    }

    private static function ensureOrderAppChrome(): void
    {
        $app = PageBlock::APP_ORDER;
        self::ensureBlock($app, 'prayer_bar', BlockDeviceSettings::prayerDefaults('order_app'), 0);
        self::ensureBlock($app, 'stat_chips', BlockDeviceSettings::DEFAULTS, afterType: 'hero');
        self::ensureBlock($app, 'trust_strip', BlockDeviceSettings::DEFAULTS, afterType: 'mode_cards');
        self::ensureBlock($app, 'office_orders', BlockDeviceSettings::DEFAULTS, afterType: 'reorder_strip');
        self::ensureBlock($app, 'opening_status', BlockDeviceSettings::DEFAULTS, afterType: 'hero');
        self::ensureBlock($app, 'site_footer', [
            'show_desktop' => true,
            'show_mobile' => true,
            'placement_desktop' => 'footer',
            'placement_mobile' => 'footer',
            'layout' => 'compact',
        ], afterType: 'brand_footer');
        self::ensureBlock($app, 'bottom_nav', [
            'show_desktop' => false,
            'show_mobile' => true,
            'placement_desktop' => 'bottom_navigation',
            'placement_mobile' => 'bottom_navigation',
            'tabs' => self::defaultBottomNavTabs(),
        ], append: true);
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    private static function ensureBlock(
        string $app,
        string $type,
        array $settings,
        ?int $position = null,
        ?string $afterType = null,
        bool $append = false,
        bool $enabled = true,
    ): void {
        $exists = PageBlock::query()
            ->where('app', $app)
            ->where('page', PageBlock::PAGE_HOME)
            ->where('block_type', $type)
            ->exists();
        if ($exists) {
            return;
        }

        $pos = $position;
        if ($pos === null && $afterType !== null) {
            $after = PageBlock::query()
                ->where('app', $app)
                ->where('page', PageBlock::PAGE_HOME)
                ->where('block_type', $afterType)
                ->value('position');
            $pos = $after !== null ? ((int) $after) + 1 : null;
            if ($pos !== null) {
                PageBlock::query()
                    ->where('app', $app)
                    ->where('page', PageBlock::PAGE_HOME)
                    ->where('position', '>=', $pos)
                    ->increment('position');
            }
        }
        if ($pos === null && $append) {
            $max = (int) PageBlock::query()
                ->where('app', $app)
                ->where('page', PageBlock::PAGE_HOME)
                ->max('position');
            $pos = $max + 1;
        }
        $pos ??= 0;

        PageBlock::query()->create([
            'app' => $app,
            'page' => PageBlock::PAGE_HOME,
            'block_type' => $type,
            'position' => $pos,
            'is_enabled' => $enabled,
            'content_mode' => BlockTypeRegistry::get($type)?->supportsSharedContent
                ? PageBlock::MODE_SHARED
                : PageBlock::MODE_OWN,
            'settings' => $settings,
        ]);
    }

    /**
     * @return list<array{id: string, label: string, href: string, visible: bool}>
     */
    public static function defaultBottomNavTabs(): array
    {
        return [
            ['id' => 'home', 'label' => 'Home', 'href' => '/', 'visible' => true],
            ['id' => 'menu', 'label' => 'Menu', 'href' => '/menu', 'visible' => true],
            ['id' => 'orders', 'label' => 'Orders', 'href' => '/orders', 'visible' => true],
            ['id' => 'events', 'label' => 'Pre-order', 'href' => '/events', 'visible' => true],
            ['id' => 'gift_cards', 'label' => 'Gift cards', 'href' => '/gift-cards', 'visible' => true],
        ];
    }

    /**
     * @return list<array{id: string, label: string, href: string, visible: bool}>
     */
    public static function defaultWebsiteBottomNavTabs(): array
    {
        return [
            ['id' => 'home', 'label' => 'Home', 'href' => '/', 'visible' => true],
            ['id' => 'menu', 'label' => 'Menu', 'href' => '/order/menu', 'visible' => true],
            ['id' => 'offers', 'label' => 'Offers', 'href' => '/#offers', 'visible' => true],
            ['id' => 'events', 'label' => 'Events', 'href' => '/order/events', 'visible' => true],
            ['id' => 'account', 'label' => 'Account', 'href' => '/order/account', 'visible' => true],
        ];
    }
}
