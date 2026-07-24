<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class WebsiteFooterTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_footer_contains_hours_order_cta_year_and_trust(): void
    {
        $year = (string) date('Y');
        $response = $this->get('/');
        $response->assertOk();
        $html = $response->getContent();

        $this->assertStringContainsString('data-footer-hours', $html);
        $this->assertStringContainsString('Opening Hours', $html);
        $this->assertStringContainsString('footer-order-cta', $html);
        $this->assertStringContainsString('/order/menu', $html);
        $this->assertStringContainsString('© '.$year, $html);
        $this->assertStringContainsString('data-footer-trust', $html);
        $this->assertStringContainsString('BML', $html);
        $this->assertStringContainsString('Malé', $html);
    }

    public function test_footer_shows_social_links_when_set_and_hides_when_empty(): void
    {
        $empty = $this->get('/');
        $empty->assertOk();
        $emptyHtml = $empty->getContent();
        $this->assertStringNotContainsString('data-social="instagram"', $emptyHtml);
        $this->assertStringNotContainsString('data-social="facebook"', $emptyHtml);
        $this->assertStringNotContainsString('data-social="tiktok"', $emptyHtml);

        SiteSetting::updateOrCreate(
            ['key' => 'social_instagram'],
            [
                'value' => 'https://instagram.com/bakeandgrill',
                'type' => 'text',
                'group' => 'Social',
                'label' => 'Instagram URL',
                'description' => '',
                'is_public' => true,
            ],
        );
        SiteSetting::updateOrCreate(
            ['key' => 'social_facebook'],
            [
                'value' => 'https://facebook.com/bakeandgrill',
                'type' => 'text',
                'group' => 'Social',
                'label' => 'Facebook URL',
                'description' => '',
                'is_public' => true,
            ],
        );
        SiteSetting::bust();
        Cache::flush();

        $response = $this->get('/');
        $response->assertOk();
        $html = $response->getContent();
        $this->assertStringContainsString('data-social="instagram"', $html);
        $this->assertStringContainsString('https://instagram.com/bakeandgrill', $html);
        $this->assertStringContainsString('data-social="facebook"', $html);
        $this->assertStringNotContainsString('data-social="tiktok"', $html);
    }
}
