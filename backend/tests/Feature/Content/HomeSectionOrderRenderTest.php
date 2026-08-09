<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\Blocks\HomeLayoutMigrator;
use App\Domains\Content\ContentResolver;
use App\Models\DailySpecial;
use App\Models\Item;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class HomeSectionOrderRenderTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_custom_website_order_renders_cta_before_specials_and_order_app_can_differ(): void
    {
        $this->createActiveSpecial();

        SiteSetting::set('offers_headline', 'Phase Specials', 'website');
        SiteSetting::set('cta_band_headline', 'CTA-FIRST-MARKER', 'website');
        SiteSetting::set('home_section_order', '["cta","specials","featured","categories","proof","location"]', 'website');
        SiteSetting::set('home_section_order', '["categories","specials","featured","proof","cta","location"]', 'order_app');
        // page_blocks is authoritative — re-seed from the settings under test.
        HomeLayoutMigrator::migrate();

        $types = array_column(
            \App\Domains\Content\Blocks\HomeLayoutSnapshot::fromPageBlocks('website'),
            'type',
        );
        $this->assertSame(
            ['hero', 'cta', 'specials', 'featured', 'categories', 'proof', 'location'],
            $types,
            'Migrated page_blocks must put cta before specials.',
        );

        $html = $this->get('/')->assertOk()->getContent();

        $ctaPos = strpos($html, 'CTA-FIRST-MARKER');
        $specialsPos = strpos($html, 'Phase Specials');

        $this->assertNotFalse($ctaPos, 'Expected CTA band to render.');
        $this->assertNotFalse($specialsPos, 'Expected specials section to render.');
        $this->assertLessThan($specialsPos, $ctaPos, 'CTA should render before specials when ordered first.');
        $this->assertSame(
            '["categories","specials","featured","proof","cta","location"]',
            ContentResolver::for('order_app')->get('home_section_order'),
        );
    }

    public function test_hero_stays_before_ordered_sections(): void
    {
        SiteSetting::set('home_section_order', '["cta","featured","categories","proof","location","specials"]', 'website');
        HomeLayoutMigrator::migrate();

        $html = $this->get('/')->assertOk()->getContent();

        $heroPos = strpos($html, 'class="hero-banner"');
        $ctaPos = strpos($html, 'class="cta-band');

        $this->assertNotFalse($heroPos, 'Expected hero banner to render.');
        $this->assertNotFalse($ctaPos, 'Expected CTA band to render.');
        $this->assertLessThan($ctaPos, $heroPos);
    }

    public function test_disabled_ordered_section_is_skipped(): void
    {
        $this->createActiveSpecial();

        SiteSetting::set('offers_headline', 'Phase Specials', 'website');
        SiteSetting::set('home_section_order', '["specials","cta","featured","categories","proof","location"]', 'website');
        SiteSetting::set('section_specials_enabled', 'false', 'website');
        HomeLayoutMigrator::migrate();

        $html = $this->get('/')->assertOk()->getContent();

        $this->assertStringNotContainsString('Phase Specials', $html);
        $this->assertStringContainsString('Hungry?', $html);
    }

    private function createActiveSpecial(): void
    {
        $item = Item::factory()->create([
            'name' => 'Phase Two Special',
            'base_price' => 100,
            'is_active' => true,
            'is_available' => true,
        ]);

        DailySpecial::create([
            'item_id' => $item->id,
            'badge_label' => 'Phase Deal',
            'discount_pct' => 10,
            'start_date' => now()->subDay()->toDateString(),
            'end_date' => now()->addDay()->toDateString(),
            'is_active' => true,
        ]);
    }
}
