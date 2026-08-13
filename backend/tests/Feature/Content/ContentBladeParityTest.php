<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentResolver;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * After Stage 3, content() reads the website app scope; SiteSetting::get() stays on shared.
 */
class ContentBladeParityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_content_helper_reads_website_scope_not_shared(): void
    {
        SiteSetting::query()->whereIn('key', [
            'business_phone', 'cta_band_headline', 'proof_stat', 'meta_title', 'site_name',
        ])->where('scope', 'website')->delete();
        SiteSetting::bust();
        ContentResolver::bust();

        SiteSetting::set('business_phone', '+960 SHARED ONLY', 'shared');
        SiteSetting::set('business_phone', '+960 WEB', 'website');
        SiteSetting::set('cta_band_headline', 'Shared CTA', 'shared');
        SiteSetting::set('cta_band_headline', 'Web CTA', 'website');

        $this->assertSame('+960 SHARED ONLY', SiteSetting::get('business_phone'));
        $this->assertSame('+960 WEB', content('business_phone'));
        $this->assertSame('Web CTA', content('cta_band_headline'));
    }

    public function test_home_view_renders_website_scoped_values(): void
    {
        SiteSetting::set('business_phone', '+960 912 0011', 'website');
        SiteSetting::set('cta_band_headline', 'Hungry? <em>Order now.</em>', 'website');
        SiteSetting::set('hero_slides', json_encode([[
            'image' => '',
            'eyebrow' => 'Test',
            'title' => 'Hello <em>world</em>',
            'subtitle' => 'Sub',
            'cta_text' => 'Order',
            'cta_url' => '/order/',
        ]]), 'website');

        $html = $this->get('/')->assertOk()->getContent();
        $this->assertStringContainsString('Hungry?', $html);
        $this->assertStringContainsString('+960 912 0011', $html);
    }
}
