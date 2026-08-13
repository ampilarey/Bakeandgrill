<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentRegistry;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class BrandKitWiringTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        SiteSetting::bust();
        Cache::flush();
    }

    public function test_dark_logo_renders_and_falls_back_to_logo(): void
    {
        // Website branding resolves from the website scope only (no shared fallback).
        SiteSetting::set('logo', '/storage/site/logo-light.png', 'website');
        SiteSetting::set('logo_dark', '/storage/site/logo-dark.png', 'website');
        SiteSetting::bust();

        $html = $this->get('/')->assertOk()->getContent();
        $this->assertStringContainsString('brand-logo--light', $html);
        $this->assertStringContainsString('brand-logo--dark', $html);
        $this->assertStringContainsString('/storage/site/logo-light.png', $html);
        $this->assertStringContainsString('/storage/site/logo-dark.png', $html);
        // img. prefix is required for specificity so .mob-nav-brand-logo { display:block }
        // cannot win a 0,1,0 tie and keep the light logo visible in dark theme.
        $this->assertStringContainsString('[data-theme="dark"] img.brand-logo--light', $html);
        $this->assertStringContainsString('[data-theme="dark"] img.brand-logo--dark', $html);

        SiteSetting::set('logo_dark', '', 'website');
        SiteSetting::bust();
        Cache::flush();

        $fallback = $this->get('/')->assertOk()->getContent();
        $this->assertGreaterThanOrEqual(
            2,
            substr_count($fallback, '/storage/site/logo-light.png'),
            'When logo_dark is empty, dark slots fall back to logo'
        );
        $this->assertStringNotContainsString('/storage/site/logo-dark.png', $fallback);
    }

    public function test_primary_color_emits_overrides_only_when_valid(): void
    {
        $plain = $this->get('/')->assertOk()->getContent();
        $this->assertStringNotContainsString('id="brand-palette"', $plain);

        SiteSetting::set('primary_color', 'not-hex', 'website');
        SiteSetting::bust();
        Cache::flush();
        $invalid = $this->get('/')->assertOk()->getContent();
        $this->assertStringNotContainsString('id="brand-palette"', $invalid);

        SiteSetting::set('primary_color', '#2B1B0F', 'website');
        SiteSetting::bust();
        Cache::flush();
        $html = $this->get('/')->assertOk()->getContent();
        $this->assertStringContainsString('id="brand-palette"', $html);
        $this->assertMatchesRegularExpression('/--amber:\s*#2B1B0F/i', $html);
        $this->assertStringContainsString('--amber-hover:', $html);
        $this->assertStringContainsString('--amber-light:', $html);
        $this->assertStringContainsString('--amber-glow:', $html);
        $this->assertStringContainsString('--amber-contrast:', $html);
        $this->assertStringContainsString('[data-theme="dark"]', $html);
        $this->assertStringContainsString('var(--amber-contrast', $html);
    }

    public function test_menu_new_days_and_og_image_groups(): void
    {
        $this->assertSame('Menu', ContentRegistry::block('menu_new_days')['group'] ?? null);
        $this->assertSame('Everywhere', ContentRegistry::block('og_image')['group'] ?? null);
        $this->assertSame('Link preview image', ContentRegistry::block('og_image')['label'] ?? null);
    }
}
