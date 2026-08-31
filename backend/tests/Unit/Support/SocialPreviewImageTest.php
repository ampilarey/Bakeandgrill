<?php

declare(strict_types=1);

namespace Tests\Unit\Support;

use App\Support\PublicOfferUrl;
use App\Support\SocialPreviewImage;
use Tests\TestCase;

class SocialPreviewImageTest extends TestCase
{
    use \Illuminate\Foundation\Testing\RefreshDatabase;

    public function test_shareable_raster_rejects_webp_and_accepts_jpeg(): void
    {
        $svc = new SocialPreviewImage;

        $this->assertTrue($svc->isShareableRaster('https://cdn.example.com/dish.jpg'));
        $this->assertTrue($svc->isShareableRaster('https://cdn.example.com/dish.jpeg'));
        $this->assertTrue($svc->isShareableRaster('https://cdn.example.com/dish.png'));
        $this->assertTrue($svc->isShareableRaster('https://cdn.example.com/dish.gif'));
        $this->assertFalse($svc->isShareableRaster('https://cdn.example.com/dish.webp'));
        $this->assertFalse($svc->isShareableRaster('https://cdn.example.com/thumb.webp.jpg.webp'));
        $this->assertTrue($svc->isShareableRaster('https://cdn.example.com/no-extension'));
    }

    public function test_a_setting_naming_deleted_media_falls_through_to_the_logo(): void
    {
        // Owner, 2026-09-01: og_image still named a media file that had been
        // removed, so every share fetched a 404 and showed no picture. A
        // fallback that cannot be fetched is not a fallback.
        \App\Models\SiteSetting::set('og_image', '/storage/menu/deleted-file.png');
        \App\Models\SiteSetting::set('default_item_image', '');
        \App\Models\SiteSetting::bust();

        $url = (new SocialPreviewImage)->siteFallback();

        $this->assertSame(asset('logo.png'), $url);
        $this->assertStringStartsWith('http', $url, 'og:image must be absolute');
    }

    public function test_a_real_uploaded_file_is_still_preferred(): void
    {
        $relative = 'storage/social-preview-test.png';
        $full = public_path($relative);
        @mkdir(dirname($full), 0775, true);
        file_put_contents($full, 'x');

        try {
            \App\Models\SiteSetting::set('og_image', '/' . $relative);
            \App\Models\SiteSetting::bust();

            $this->assertSame(url($relative), (new SocialPreviewImage)->siteFallback());
        } finally {
            @unlink($full);
        }
    }
}

class PublicOfferUrlTest extends TestCase
{
    public function test_special_and_promo_rows_become_stable_paths(): void
    {
        $this->assertSame('/offers/special/9', PublicOfferUrl::fromFeedRow([
            'kind' => 'special',
            'special_id' => 9,
            'id' => 'special-9',
        ]));
        $this->assertSame('/offers/special/9', PublicOfferUrl::fromFeedRow([
            'kind' => 'special',
            'id' => 'special-9',
        ]));
        $this->assertSame('/offers/promo/4', PublicOfferUrl::fromFeedRow([
            'kind' => 'promo',
            'promotion_id' => 4,
        ]));
        $this->assertSame('/menu', PublicOfferUrl::fromFeedRow(['kind' => 'promo']));
    }
}
