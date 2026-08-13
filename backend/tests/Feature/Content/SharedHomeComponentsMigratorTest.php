<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\Blocks\HomeLayoutMigrator;
use App\Domains\Content\Blocks\SharedHomeComponentsMigrator;
use App\Models\PageBlock;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class SharedHomeComponentsMigratorTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_upgrade_adds_injected_chrome_without_losing_existing_rows(): void
    {
        HomeLayoutMigrator::migrate();

        $beforeWebsite = PageBlock::query()
            ->where('app', 'website')
            ->orderBy('position')
            ->pluck('block_type')
            ->all();
        $this->assertContains('hero', $beforeWebsite);
        // CustomerSurfaceMigrator (via HomeLayoutMigrator) already promotes trust_strip.
        $this->assertContains('trust_strip', $beforeWebsite);

        SharedHomeComponentsMigrator::migrate();

        $website = PageBlock::query()
            ->where('app', 'website')
            ->orderBy('position')
            ->pluck('block_type')
            ->all();
        $order = PageBlock::query()
            ->where('app', 'order_app')
            ->orderBy('position')
            ->pluck('block_type')
            ->all();

        $this->assertContains('hero', $website);
        $this->assertContains('trust_strip', $website);
        $this->assertContains('events_band', $website);
        $this->assertContains('prayer_bar', $website);
        $this->assertContains('brand_footer', $website);

        $this->assertContains('greeting', $order);
        $this->assertContains('prayer_bar', $order);
        $this->assertContains('stat_chips', $order);
        $this->assertContains('trust_strip', $order);
        $this->assertContains('mode_cards', $order);

        // Original sections preserved.
        foreach (['specials', 'featured', 'categories', 'proof', 'cta', 'location'] as $type) {
            $this->assertContains($type, $website);
        }
    }

    public function test_promo_carousel_merges_into_hero(): void
    {
        HomeLayoutMigrator::migrate();
        PageBlock::query()->where('app', 'order_app')->where('block_type', 'hero')->delete();
        PageBlock::create([
            'app' => 'order_app',
            'page' => 'home',
            'block_type' => 'promo_carousel',
            'position' => 2,
            'is_enabled' => true,
            'content_mode' => PageBlock::MODE_OWN,
            'settings' => [],
        ]);

        SharedHomeComponentsMigrator::migrate();

        $types = PageBlock::query()
            ->where('app', 'order_app')
            ->pluck('block_type')
            ->all();
        $this->assertContains('hero', $types);
        $this->assertNotContains('promo_carousel', $types);
    }

    public function test_shared_content_does_not_force_shared_visibility(): void
    {
        HomeLayoutMigrator::migrate();
        SharedHomeComponentsMigrator::migrate();

        $webTrust = PageBlock::query()
            ->where('app', 'website')
            ->where('block_type', 'trust_strip')
            ->first();
        $orderTrust = PageBlock::query()
            ->where('app', 'order_app')
            ->where('block_type', 'trust_strip')
            ->first();

        $this->assertNotNull($webTrust);
        $this->assertNotNull($orderTrust);

        $webTrust->update(['is_enabled' => false, 'content_mode' => PageBlock::MODE_OWN]);
        $orderTrust->update(['is_enabled' => true, 'content_mode' => PageBlock::MODE_OWN]);

        $this->assertFalse((bool) $webTrust->fresh()->is_enabled);
        $this->assertTrue((bool) $orderTrust->fresh()->is_enabled);
    }

    public function test_disabled_trust_and_events_blocks_do_not_render_on_website(): void
    {
        HomeLayoutMigrator::migrate();
        SharedHomeComponentsMigrator::migrate();
        PageBlock::query()
            ->where('app', 'website')
            ->whereIn('block_type', ['trust_strip', 'events_band'])
            ->update(['is_enabled' => false]);
        Cache::flush();

        $html = $this->get('/')->assertOk()->getContent();
        $this->assertStringNotContainsString('class="trust-strip"', $html);
        $this->assertStringNotContainsString('class="events-band"', $html);
    }

    public function test_announcement_setting_seeds_announcement_block(): void
    {
        SiteSetting::set('announcement_enabled', 'true', 'shared');
        SiteSetting::set('announcement_text', 'Hello guests', 'shared');
        HomeLayoutMigrator::migrate();
        SharedHomeComponentsMigrator::migrate();

        $this->assertTrue(
            PageBlock::query()
                ->where('app', 'website')
                ->where('block_type', 'announcement')
                ->where('is_enabled', true)
                ->exists(),
        );
    }
}
