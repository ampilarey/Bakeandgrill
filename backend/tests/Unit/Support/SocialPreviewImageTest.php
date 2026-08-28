<?php

declare(strict_types=1);

namespace Tests\Unit\Support;

use App\Support\PublicOfferUrl;
use App\Support\SocialPreviewImage;
use Tests\TestCase;

class SocialPreviewImageTest extends TestCase
{
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
