<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Owner, 2026-09-30: the light logo and the cream no-photo tile, applied through the site. */
class LightLogoSeedTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_website_and_order_app_get_the_light_logo_and_the_cream_tile(): void
    {
        $this->assertSame('/brand/logo-light.png', SiteSetting::getScoped('logo', 'website'));
        $this->assertSame('/brand/logo-light.png', SiteSetting::getScoped('logo', 'order_app'));
        $this->assertSame('/brand/default-item-image.png', SiteSetting::getScoped('default_item_image', 'order_app'));
        $this->assertSame('/brand/default-item-image.png', content('default_item_image'));
        $this->assertSame('/brand/logo-light.png', content('logo'));
        $this->assertSame('/brand/logo-dark.png', content('logo_dark'));

        foreach (['logo-light.png', 'default-item-image.png', 'logo-dark.png', 'logo-mark.png'] as $file) {
            $this->assertFileExists(public_path('brand/' . $file));
        }
    }

    public function test_the_website_header_uses_it(): void
    {
        $html = $this->get('/')->assertOk()->getContent();

        $this->assertStringContainsString('/brand/logo-light.png', $html);
    }
}
