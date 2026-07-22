<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * At shared defaults, content() and SiteSetting::get() agree — no visual shift.
 */
class ContentBladeParityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_content_helper_matches_site_setting_get_for_shared_values(): void
    {
        $keys = [
            'business_phone' => '+960 912 0011',
            'cta_band_headline' => 'Hungry? <em>Order now.</em>',
            'proof_stat' => '500+',
            'meta_title' => 'Bake & Grill – Dhivehi Breakfast & Artisan Baking in Malé',
            'site_name' => 'Bake & Grill',
        ];

        foreach ($keys as $key => $value) {
            SiteSetting::set($key, $value, 'shared');
        }
        SiteSetting::bust();
        \App\Domains\Content\ContentResolver::bust();

        foreach ($keys as $key => $value) {
            $this->assertSame(
                SiteSetting::get($key, 'FALLBACK'),
                content($key, 'FALLBACK'),
                "Mismatch for {$key}",
            );
            $this->assertSame($value, content($key));
        }
    }

    public function test_home_view_renders_shared_defaults_without_error(): void
    {
        SiteSetting::set('business_phone', '+960 912 0011', 'shared');
        SiteSetting::set('cta_band_headline', 'Hungry? <em>Order now.</em>', 'shared');
        SiteSetting::set('hero_slide_1', json_encode([
            'image' => '',
            'eyebrow' => 'Test',
            'title' => 'Hello <em>world</em>',
            'subtitle' => 'Sub',
            'cta_text' => 'Order',
            'cta_url' => '/order/',
        ]), 'shared');

        $html = $this->get('/')->assertOk()->getContent();
        $this->assertStringContainsString('Hungry?', $html);
        $this->assertStringContainsString('+960 912 0011', $html);
    }
}
