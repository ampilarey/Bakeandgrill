<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\Blocks\BlockDeviceSettings;
use App\Domains\Content\Blocks\BlockTypeRegistry;
use App\Domains\Content\Blocks\CustomerSurfaceMigrator;
use App\Domains\Content\Blocks\HomeChromeResolver;
use App\Domains\Content\Blocks\HomeLayoutMigrator;
use App\Domains\Content\Blocks\PageBlockRepository;
use App\Domains\Content\Blocks\SurfaceCatalog;
use App\Models\PageBlock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class CustomerSurfaceBuilderTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        HomeLayoutMigrator::migrate();
    }

    public function test_surface_catalog_lists_website_and_order_app_desktop_and_mobile_surfaces(): void
    {
        $surfaces = SurfaceCatalog::all();
        $ids = array_column($surfaces, 'id');

        foreach (['website', 'order_app'] as $app) {
            foreach (['desktop', 'mobile'] as $device) {
                foreach (SurfaceCatalog::slotsFor($app, $device) as $slot) {
                    $this->assertContains(
                        SurfaceCatalog::id($app, $device, $slot),
                        $ids,
                        "Missing surface {$app}.{$device}.{$slot}",
                    );
                }
            }
        }

        $this->assertCount(14, $surfaces, 'Website+Order App × desktop+mobile slots (bottom nav mobile-only).');
    }

    public function test_bottom_navigation_is_mobile_only(): void
    {
        foreach (['website', 'order_app'] as $app) {
            $this->assertNotContains(
                'bottom_navigation',
                SurfaceCatalog::slotsFor($app, 'desktop'),
                "{$app} desktop must not expose bottom_navigation.",
            );
            $this->assertContains(
                'bottom_navigation',
                SurfaceCatalog::slotsFor($app, 'mobile'),
                "{$app} mobile must expose bottom_navigation.",
            );
        }
    }

    public function test_customer_surface_migrator_creates_chrome_blocks_idempotently(): void
    {
        $expected = [
            'website' => ['prayer_bar', 'site_footer', 'bottom_nav'],
            'order_app' => ['prayer_bar', 'site_footer', 'bottom_nav'],
        ];

        foreach ($expected as $app => $types) {
            foreach ($types as $type) {
                $this->assertTrue(
                    PageBlock::query()
                        ->where('app', $app)
                        ->where('page', PageBlock::PAGE_HOME)
                        ->where('block_type', $type)
                        ->exists(),
                    "{$app} missing {$type} after migrate.",
                );
            }
        }

        $countsBefore = PageBlock::query()->count();
        CustomerSurfaceMigrator::migrate();
        $this->assertSame($countsBefore, PageBlock::query()->count(), 'Second migrate must not duplicate rows.');
    }

    public function test_website_and_order_app_prayer_visibility_are_independent(): void
    {
        PageBlock::query()
            ->where('app', 'website')
            ->where('block_type', 'prayer_bar')
            ->update(['is_enabled' => false]);
        PageBlockRepository::bustAll();
        Cache::flush();

        $website = HomeChromeResolver::resolve('website', 'prayer_bar');
        $order = HomeChromeResolver::resolve('order_app', 'prayer_bar');

        $this->assertFalse($website['enabled']);
        $this->assertTrue($order['enabled']);
    }

    public function test_shared_content_mode_does_not_force_shared_visibility(): void
    {
        $websitePrayer = PageBlock::query()
            ->where('app', 'website')
            ->where('block_type', 'prayer_bar')
            ->firstOrFail();
        $orderPrayer = PageBlock::query()
            ->where('app', 'order_app')
            ->where('block_type', 'prayer_bar')
            ->firstOrFail();

        $websitePrayer->update([
            'content_mode' => PageBlock::MODE_SHARED,
            'settings' => array_merge($websitePrayer->resolvedSettings(), ['show_mobile' => false]),
        ]);
        $orderPrayer->update(['content_mode' => PageBlock::MODE_SHARED]);
        PageBlockRepository::bustAll();

        $website = HomeChromeResolver::resolve('website', 'prayer_bar');
        $order = HomeChromeResolver::resolve('order_app', 'prayer_bar');

        $this->assertTrue($website['show_desktop']);
        $this->assertFalse($website['show_mobile'], 'Website mobile visibility is independent of shared content mode.');
        $this->assertTrue($order['show_mobile']);
    }

    public function test_for_surface_returns_only_matching_placement(): void
    {
        PageBlock::query()->delete();

        PageBlock::create([
            'app' => 'website',
            'page' => PageBlock::PAGE_HOME,
            'block_type' => 'rich_text',
            'position' => 0,
            'is_enabled' => true,
            'content_mode' => PageBlock::MODE_OWN,
            'settings' => [
                'show_desktop' => true,
                'show_mobile' => true,
                'placement_desktop' => 'home',
                'placement_mobile' => 'header',
            ],
        ]);
        PageBlock::create([
            'app' => 'website',
            'page' => PageBlock::PAGE_HOME,
            'block_type' => 'divider',
            'position' => 1,
            'is_enabled' => true,
            'content_mode' => PageBlock::MODE_OWN,
            'settings' => [
                'show_desktop' => true,
                'show_mobile' => false,
                'placement_desktop' => 'footer',
                'placement_mobile' => 'footer',
            ],
        ]);
        PageBlockRepository::bustAll();

        $blocks = PageBlockRepository::forPage('website');
        $desktopHome = PageBlockRepository::forSurface('website', 'desktop', 'home', $blocks);
        $mobileHeader = PageBlockRepository::forSurface('website', 'mobile', 'header', $blocks);
        $desktopFooter = PageBlockRepository::forSurface('website', 'desktop', 'footer', $blocks);

        $this->assertSame(['rich_text'], $desktopHome->pluck('block_type')->all());
        $this->assertSame(['rich_text'], $mobileHeader->pluck('block_type')->all());
        $this->assertSame(['divider'], $desktopFooter->pluck('block_type')->all());
    }

    /**
     * @dataProvider libraryTypesProvider
     */
    public function test_every_library_type_can_be_created_on_both_apps(string $type): void
    {
        $def = BlockTypeRegistry::get($type);
        $this->assertNotNull($def, "Unknown library type [{$type}]");

        foreach (['website', 'order_app'] as $app) {
            $this->assertTrue($def->allowsApp($app), "{$type} must allow {$app}");

            PageBlock::query()
                ->where('app', $app)
                ->where('page', PageBlock::PAGE_HOME)
                ->where('block_type', $type)
                ->delete();

            $settings = $def->settingsDefaults;
            if ($type === 'site_footer') {
                $settings = array_merge($settings, [
                    'placement_desktop' => 'footer',
                    'placement_mobile' => 'footer',
                ]);
            }
            if ($type === 'bottom_nav') {
                $settings = array_merge($settings, [
                    'placement_desktop' => 'bottom_navigation',
                    'placement_mobile' => 'bottom_navigation',
                    'tabs' => CustomerSurfaceMigrator::defaultBottomNavTabs(),
                ]);
            }

            $block = PageBlock::create([
                'app' => $app,
                'page' => PageBlock::PAGE_HOME,
                'block_type' => $type,
                'position' => 0,
                'is_enabled' => true,
                'content_mode' => $def->supportsSharedContent ? PageBlock::MODE_SHARED : PageBlock::MODE_OWN,
                'settings' => $settings,
            ]);

            $this->assertSame($type, $block->block_type);
            $this->assertTrue(
                PageBlock::query()
                    ->where('app', $app)
                    ->where('block_type', $type)
                    ->exists(),
            );
        }
    }

    /** @return array<string, array{0: string}> */
    public static function libraryTypesProvider(): array
    {
        $cases = [];
        foreach (BlockTypeRegistry::libraryTypes() as $type) {
            $cases[$type] = [$type];
        }

        return $cases;
    }

    public function test_footer_and_bottom_navigation_are_separate_slots_and_types(): void
    {
        $websiteFooter = PageBlock::query()
            ->where('app', 'website')
            ->where('block_type', 'site_footer')
            ->firstOrFail();
        $websiteNav = PageBlock::query()
            ->where('app', 'website')
            ->where('block_type', 'bottom_nav')
            ->firstOrFail();

        $this->assertNotSame($websiteFooter->id, $websiteNav->id);
        $this->assertSame('footer', BlockDeviceSettings::placementDesktop($websiteFooter->resolvedSettings()));
        $this->assertSame('footer', BlockDeviceSettings::placementMobile($websiteFooter->resolvedSettings()));
        $this->assertSame('bottom_navigation', BlockDeviceSettings::placementMobile($websiteNav->resolvedSettings()));
        $this->assertContains('site_footer', SurfaceCatalog::typesForSlot('footer'));
        $this->assertContains('bottom_nav', SurfaceCatalog::typesForSlot('bottom_navigation'));
        $this->assertNotContains('bottom_nav', SurfaceCatalog::typesForSlot('footer'));
        $this->assertNotContains('site_footer', SurfaceCatalog::typesForSlot('bottom_navigation'));
    }

    public function test_prayer_bar_block_exists_and_supports_header_and_home_placement_per_device(): void
    {
        $prayer = PageBlock::query()
            ->where('app', 'website')
            ->where('block_type', 'prayer_bar')
            ->firstOrFail();

        $this->assertTrue($prayer->is_enabled);

        $prayer->update([
            'settings' => [
                'show_desktop' => true,
                'show_mobile' => true,
                'placement_desktop' => 'header',
                'placement_mobile' => 'home',
            ],
        ]);
        PageBlockRepository::bustAll();

        $resolved = HomeChromeResolver::resolve('website', 'prayer_bar');
        $this->assertTrue($resolved['enabled']);
        $this->assertTrue(HomeChromeResolver::showInHeader('website', 'prayer_bar', 'desktop'));
        $this->assertTrue(HomeChromeResolver::showInHome('website', 'prayer_bar', 'mobile'));
        $this->assertFalse(HomeChromeResolver::showInHome('website', 'prayer_bar', 'desktop'));
        $this->assertFalse(HomeChromeResolver::showInHeader('website', 'prayer_bar', 'mobile'));

        $blocks = PageBlockRepository::forPage('website');
        $desktopHeader = PageBlockRepository::forSurface('website', 'desktop', 'header', $blocks)
            ->pluck('block_type')
            ->all();
        $mobileHome = PageBlockRepository::forSurface('website', 'mobile', 'home', $blocks)
            ->pluck('block_type')
            ->all();

        $this->assertContains('prayer_bar', $desktopHeader);
        $this->assertNotContains('prayer_bar', PageBlockRepository::forSurface('website', 'desktop', 'home', $blocks)->pluck('block_type')->all());
        $this->assertContains('prayer_bar', $mobileHome);
        $this->assertNotContains('prayer_bar', PageBlockRepository::forSurface('website', 'mobile', 'header', $blocks)->pluck('block_type')->all());
    }
}
