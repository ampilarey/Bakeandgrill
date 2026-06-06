<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class PublicSiteSettingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_public_api_includes_cms_wording_keys_after_migration(): void
    {
        $publicKeys = [
            'menu_page_title',
            'menu_page_subtitle',
            'preorder_page_title',
            'preorder_confirm_steps',
            'about_page_title',
            'about_values',
            'order_checkout_title',
            'order_auth_privacy_line',
            'home_hero_fallback_title',
            'nav_order_cta_text',
            'footer_quick_links_heading',
            'home_open_badge_text',
            'cta_band_headline',
            'home_categories_eyebrow',
            'legal_privacy_body',
            'contact_page_title',
            'hours_page_note',
        ];

        foreach ($publicKeys as $key) {
            $this->assertNotNull(
                SiteSetting::where('key', $key)->where('is_public', true)->first(),
                "Expected public site setting key [{$key}] to exist after migrations",
            );
        }

        Cache::forget('site_settings.public');

        $response = $this->getJson('/api/site-settings/public');
        $response->assertOk();

        $settings = $response->json('settings');
        $this->assertIsArray($settings);

        foreach ($publicKeys as $key) {
            $this->assertArrayHasKey($key, $settings, "Public API should include settings.{$key}");
        }

        $this->assertNotSame('', $settings['menu_page_title'] ?? '');
        $this->assertNotSame('', $settings['order_checkout_title'] ?? '');
        $this->assertNotSame('', $settings['cta_band_headline'] ?? '');
    }

    public function test_public_api_returns_updated_menu_page_title(): void
    {
        SiteSetting::updateOrCreate(
            ['key' => 'menu_page_title'],
            [
                'value' => 'Test Menu Headline',
                'type' => 'text',
                'group' => 'Menu',
                'label' => 'Menu Page — Title',
                'description' => '',
                'is_public' => true,
            ],
        );
        SiteSetting::bust();

        $response = $this->getJson('/api/site-settings/public');
        $response->assertOk();
        $response->assertJsonPath('settings.menu_page_title', 'Test Menu Headline');
    }
}
