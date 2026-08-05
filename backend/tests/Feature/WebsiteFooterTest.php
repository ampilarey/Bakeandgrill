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

    public function test_mobile_bottom_nav_has_five_tabs_with_order_center_cta(): void
    {
        $html = $this->get('/')->assertOk()->getContent();

        $this->assertStringContainsString('data-mobile-bottom-nav', $html);
        $this->assertStringContainsString('data-nav="home"', $html);
        $this->assertStringContainsString('data-nav="menu"', $html);
        $this->assertStringContainsString('data-nav="order"', $html);
        $this->assertStringContainsString('data-nav="offers"', $html);
        $this->assertStringContainsString('data-nav="account"', $html);
        $this->assertStringContainsString('mob-nav-order', $html);
        $this->assertStringContainsString('/#offers', $html);
        $this->assertStringContainsString('/order/account', $html);
        $this->assertStringNotContainsString('mobMoreBtn', $html);
        $this->assertStringNotContainsString('mob-more-sheet', $html);
        $this->assertStringNotContainsString('>More</', $html);
    }

    public function test_whatsapp_viber_appear_once_in_page_and_once_in_footer(): void
    {
        $html = $this->get('/')->assertOk()->getContent();

        preg_match_all('/data-home-chat/', $html, $homeChat);
        $this->assertCount(1, $homeChat[0], 'Exactly one in-page Chat with us block');

        preg_match_all('/class="[^"]*chat-btn-wa[^"]*"/', $html, $waInPage);
        $this->assertCount(1, $waInPage[0], 'WhatsApp once in-page');

        preg_match_all('/class="[^"]*chat-btn-viber[^"]*"/', $html, $viberInPage);
        $this->assertCount(1, $viberInPage[0], 'Viber once in-page');

        preg_match_all('/class="[^"]*footer-wa[^"]*"/', $html, $waFooter);
        $this->assertCount(1, $waFooter[0], 'WhatsApp once in footer');

        preg_match_all('/class="[^"]*footer-viber[^"]*"/', $html, $viberFooter);
        $this->assertCount(1, $viberFooter[0], 'Viber once in footer');

        $this->assertStringNotContainsString('Order via WhatsApp', $html);
        $this->assertStringNotContainsString('Order via Viber', $html);
    }

    public function test_footer_blurb_ignores_legacy_copyright_footer_text(): void
    {
        SiteSetting::updateOrCreate(
            ['key' => 'footer_text'],
            [
                'value' => '© 2026 Bake & Grill. All rights reserved.',
                'type' => 'textarea',
                'group' => 'Footer',
                'label' => 'Footer blurb',
                'description' => '',
                'is_public' => true,
            ],
        );
        SiteSetting::updateOrCreate(
            ['key' => 'site_tagline'],
            [
                'value' => 'Fresh every day in Malé.',
                'type' => 'textarea',
                'group' => 'General',
                'label' => 'Tagline',
                'description' => '',
                'is_public' => true,
            ],
        );
        SiteSetting::bust();
        Cache::flush();

        $html = $this->get('/')->assertOk()->getContent();
        $this->assertStringContainsString('data-footer-hours-today', $html);
        preg_match('/class="footer-brand".*?class="footer-col/s', $html, $brand);
        $brandHtml = $brand[0] ?? '';
        $this->assertStringContainsString('Fresh every day in Malé.', $brandHtml);
        $this->assertStringNotContainsString('All rights reserved.', $brandHtml);
    }

    public function test_show_social_links_false_hides_icons_even_when_urls_set(): void
    {
        SiteSetting::updateOrCreate(
            ['key' => 'social_instagram'],
            [
                'value' => 'https://instagram.com/bakeandgrill',
                'type' => 'text',
                'group' => 'Footer',
                'label' => 'Instagram URL',
                'description' => '',
                'is_public' => true,
            ],
        );
        SiteSetting::updateOrCreate(
            ['key' => 'show_social_links'],
            [
                'value' => 'false',
                'type' => 'boolean',
                'group' => 'Footer',
                'label' => 'Show social links',
                'description' => '',
                'is_public' => true,
            ],
        );
        SiteSetting::bust();
        Cache::flush();

        $html = $this->get('/')->assertOk()->getContent();
        $this->assertStringNotContainsString('data-social="instagram"', $html);
    }
}
