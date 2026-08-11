<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\Blocks\HomeLayoutMigrator;
use App\Domains\Content\ContentRegistry;
use App\Models\PageBlock;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * Stage F: section visibility is a page_blocks concern. The old
 * section_*_enabled / home_section_order content keys are retired — they must
 * no longer gate rendering and must not be offered in the content editor.
 */
class SectionGatingTest extends TestCase
{
    use RefreshDatabase;

    private const RETIRED_KEYS = [
        'home_section_order',
        'section_hero_enabled',
        'section_specials_enabled',
        'section_featured_enabled',
        'section_categories_enabled',
        'section_proof_enabled',
        'section_cta_enabled',
        'section_location_enabled',
        'section_reviews_enabled',
    ];

    public function test_retired_section_keys_are_gone_from_the_content_registry(): void
    {
        foreach (self::RETIRED_KEYS as $key) {
            $this->assertFalse(
                ContentRegistry::has($key),
                "{$key} no longer controls anything and must not be offered in the content editor.",
            );
        }
    }

    public function test_website_section_visibility_follows_page_blocks_not_legacy_keys(): void
    {
        HomeLayoutMigrator::migrate();
        SiteSetting::set('cta_band_headline', 'Visible CTA Headline ABC', 'website');
        Cache::flush();

        $this->assertStringContainsString(
            'Visible CTA Headline ABC',
            $this->get('/')->assertOk()->getContent(),
        );

        // Turning the legacy key off changes nothing — the block is what counts.
        SiteSetting::set('section_cta_enabled', 'false', 'website');
        Cache::flush();
        $this->assertStringContainsString(
            'Visible CTA Headline ABC',
            $this->get('/')->assertOk()->getContent(),
            'Retired section_cta_enabled must not gate the rendered home page.',
        );

        PageBlock::query()
            ->where('app', 'website')
            ->where('block_type', 'cta')
            ->update(['is_enabled' => false]);
        Cache::flush();

        $this->assertStringNotContainsString(
            'Visible CTA Headline ABC',
            $this->get('/')->assertOk()->getContent(),
            'Disabling the cta block must hide the section.',
        );
    }

    public function test_retired_keys_are_not_published_to_either_app(): void
    {
        SiteSetting::set('section_specials_enabled', 'false', 'order_app');
        Cache::flush();

        $website = $this->getJson('/api/content?app=website&locale=en')->assertOk()->json('content');
        $order = $this->getJson('/api/content?app=order_app&locale=en')->assertOk()->json('content');

        foreach (self::RETIRED_KEYS as $key) {
            $this->assertArrayNotHasKey($key, $website);
            $this->assertArrayNotHasKey($key, $order);
        }
    }
}
