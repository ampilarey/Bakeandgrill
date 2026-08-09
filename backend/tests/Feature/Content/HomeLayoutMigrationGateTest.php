<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\Blocks\HomeLayoutMigrator;
use App\Domains\Content\Blocks\HomeLayoutSnapshot;
use App\Models\PageBlock;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * THE GATE for Stage B: rendered section order + enabled set must be
 * identical before and after migration for BOTH apps.
 * Do not change the expected snapshot to match a bad migration.
 */
class HomeLayoutMigrationGateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_default_layouts_match_before_and_after_migration(): void
    {
        $beforeWebsite = HomeLayoutSnapshot::legacyWebsite();
        $beforeOrder = HomeLayoutSnapshot::legacyOrderApp();

        HomeLayoutMigrator::migrate();

        $this->assertSame(
            $beforeWebsite,
            HomeLayoutSnapshot::fromPageBlocks('website'),
            'Website home order/enabled set changed during migration.',
        );
        $this->assertSame(
            $beforeOrder,
            HomeLayoutSnapshot::fromPageBlocks('order_app'),
            'Order-app home order/enabled set changed during migration.',
        );
    }

    public function test_custom_orders_and_disabled_sections_are_preserved(): void
    {
        SiteSetting::set('home_section_order', '["cta","specials","featured","categories","proof","location"]', 'website');
        SiteSetting::set('section_featured_enabled', 'false', 'website');
        SiteSetting::set('section_hero_enabled', 'false', 'website');

        SiteSetting::set('home_section_order', '["categories","specials","featured","proof","cta","location"]', 'order_app');
        SiteSetting::set('section_specials_enabled', 'false', 'order_app');
        SiteSetting::set('section_reviews_enabled', 'true', 'order_app');

        $beforeWebsite = HomeLayoutSnapshot::legacyWebsite();
        $beforeOrder = HomeLayoutSnapshot::legacyOrderApp();

        // Reviews should sit after categories when specials is off.
        $orderTypes = array_column($beforeOrder, 'type');
        $this->assertSame('categories', $orderTypes[array_search('categories', $orderTypes, true)]);
        $catIdx = array_search('categories', $orderTypes, true);
        $revIdx = array_search('reviews', $orderTypes, true);
        $this->assertNotFalse($catIdx);
        $this->assertNotFalse($revIdx);
        $this->assertGreaterThan($catIdx, $revIdx);

        HomeLayoutMigrator::migrate();

        $this->assertSame($beforeWebsite, HomeLayoutSnapshot::fromPageBlocks('website'));
        $this->assertSame($beforeOrder, HomeLayoutSnapshot::fromPageBlocks('order_app'));
    }

    public function test_migration_is_idempotent(): void
    {
        HomeLayoutMigrator::migrate();
        $first = PageBlock::query()->orderBy('id')->get()->toArray();

        HomeLayoutMigrator::migrate();
        $second = PageBlock::query()->orderBy('id')->get()->map(function (PageBlock $b) {
            return [
                'app' => $b->app,
                'page' => $b->page,
                'block_type' => $b->block_type,
                'position' => $b->position,
                'is_enabled' => $b->is_enabled,
                'content_mode' => $b->content_mode,
            ];
        })->all();

        $firstNormalized = collect($first)->map(fn ($r) => [
            'app' => $r['app'],
            'page' => $r['page'],
            'block_type' => $r['block_type'],
            'position' => $r['position'],
            'is_enabled' => (bool) $r['is_enabled'],
            'content_mode' => $r['content_mode'],
        ])->all();

        $this->assertSame($firstNormalized, $second);
        $this->assertSame(
            HomeLayoutSnapshot::legacyWebsite(),
            HomeLayoutSnapshot::fromPageBlocks('website'),
        );
        $this->assertSame(
            HomeLayoutSnapshot::legacyOrderApp(),
            HomeLayoutSnapshot::fromPageBlocks('order_app'),
        );
    }

    /**
     * End-to-end gate: the snapshot-based tests above compare the migrator
     * against HomeLayoutSnapshot, but the migrator is FED by that snapshot,
     * so they cannot catch the snapshot mis-describing the old layout.
     * This renders the real website home twice — legacy path (empty
     * page_blocks) vs blocks path (after migrate) — and asserts the same
     * sections appear in the same order in the actual HTML.
     */
    public function test_rendered_website_home_matches_between_legacy_and_blocks_paths(): void
    {
        // class="…" needles so the <style> block (.hero-banner { … }) never matches.
        $markers = [
            'hero' => 'class="hero-banner"',
            'trust_strip' => 'class="trust-strip"',
            'specials' => 'id="offers"',
            'featured' => 'class="products-grid"',
            'categories' => 'class="categories-grid"',
            'proof' => 'class="proof-strip"',
            'cta' => 'class="cta-band-inner"',
            'location' => 'class="loc-ctas"',
        ];

        // The schema migration seeds page_blocks; reverse to reach the true legacy path.
        HomeLayoutMigrator::reverse();
        Cache::flush();
        $this->assertSame(0, PageBlock::query()->count(), 'Expected empty page_blocks before migration.');
        $legacyHtml = $this->get('/')->assertOk()->getContent();
        $legacyOrder = $this->orderedMarkers($legacyHtml, $markers);

        $this->assertNotEmpty($legacyOrder, 'Legacy home rendered no known sections — markers are stale.');
        $this->assertContains('trust_strip', $legacyOrder);

        HomeLayoutMigrator::migrate();
        Cache::flush();

        $blocksHtml = $this->get('/')->assertOk()->getContent();

        $this->assertSame(
            $legacyOrder,
            $this->orderedMarkers($blocksHtml, $markers),
            'Rendered website home sections differ between the legacy path and the page_blocks path.',
        );
    }

    /**
     * @param  array<string, string>  $markers
     * @return list<string> marker names present in $html, in document order
     */
    private function orderedMarkers(string $html, array $markers): array
    {
        $found = [];
        foreach ($markers as $name => $needle) {
            $pos = strpos($html, $needle);
            if ($pos !== false) {
                $found[$name] = $pos;
            }
        }
        asort($found);

        return array_keys($found);
    }

    public function test_default_website_snapshot_is_hero_plus_home_section_order_defaults(): void
    {
        $types = array_column(HomeLayoutSnapshot::legacyWebsite(), 'type');
        $this->assertSame(
            ['hero', 'specials', 'featured', 'categories', 'proof', 'cta', 'location'],
            $types,
        );
    }

    public function test_default_order_app_snapshot_matches_actual_homepage_tsx_order(): void
    {
        $types = array_column(HomeLayoutSnapshot::legacyOrderApp(), 'type');
        $this->assertSame(
            [
                'greeting',
                'prayer_bar',
                'hero',
                'opening_status',
                'mode_cards',
                'specials',
                'reviews',
                'categories',
                'reorder_strip',
                'brand_footer',
            ],
            $types,
        );
    }
}
