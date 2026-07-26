<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SectionGatingTest extends TestCase
{
    use RefreshDatabase;

    public function test_website_hides_specials_section_when_disabled(): void
    {
        SiteSetting::set('section_specials_enabled', 'false', 'website');
        SiteSetting::set('section_specials_enabled', 'true', 'order_app');
        SiteSetting::set('offers_headline', 'Hidden Offers Headline XYZ', 'website');

        $html = $this->get('/')->assertOk()->getContent();
        $this->assertStringNotContainsString('Hidden Offers Headline XYZ', $html);
    }

    public function test_website_shows_sections_by_default(): void
    {
        SiteSetting::set('section_cta_enabled', 'true', 'website');
        SiteSetting::set('cta_band_headline', 'Visible CTA Headline ABC', 'website');

        $html = $this->get('/')->assertOk()->getContent();
        $this->assertStringContainsString('Visible CTA Headline ABC', $html);
    }

    public function test_order_app_public_content_exposes_section_flags_independently(): void
    {
        SiteSetting::set('section_specials_enabled', 'true', 'website');
        SiteSetting::set('section_specials_enabled', 'false', 'order_app');

        $website = $this->getJson('/api/content?app=website&locale=en')->assertOk()->json('content');
        $order = $this->getJson('/api/content?app=order_app&locale=en')->assertOk()->json('content');

        $this->assertSame('true', $website['section_specials_enabled'] ?? null);
        $this->assertSame('false', $order['section_specials_enabled'] ?? null);
    }

    public function test_section_enabled_keys_seed_true_via_registry_default(): void
    {
        foreach ([
            'section_hero_enabled',
            'section_specials_enabled',
            'section_featured_enabled',
            'section_categories_enabled',
            'section_proof_enabled',
            'section_cta_enabled',
            'section_location_enabled',
            'section_reviews_enabled',
        ] as $key) {
            $val = \App\Domains\Content\ContentResolver::for('website')->get($key);
            $this->assertSame('true', (string) $val, "Expected {$key} default true");
        }
    }
}
