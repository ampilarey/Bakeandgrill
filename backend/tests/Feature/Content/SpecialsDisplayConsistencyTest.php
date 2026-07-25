<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Promotions\Services\OffersService;
use App\Models\Category;
use App\Models\DailySpecial;
use App\Models\Item;
use App\Services\SpecialPricingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class SpecialsDisplayConsistencyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_home_offers_prices_use_slash_dash_and_circular_image_class(): void
    {
        $category = Category::create([
            'name' => 'Grill',
            'slug' => 'grill-display',
            'is_active' => true,
        ]);
        $item = Item::create([
            'category_id' => $category->id,
            'name' => 'Display Special Burger',
            'base_price' => 100.00,
            'sku' => 'DSP-B001',
            'barcode' => 'DSP-B001',
            'is_active' => true,
            'is_available' => true,
        ]);
        DailySpecial::create([
            'item_id' => $item->id,
            'is_active' => true,
            'start_date' => today()->toDateString(),
            'end_date' => today()->toDateString(),
            'discount_pct' => 20,
            'badge_label' => '20% OFF',
        ]);

        app(OffersService::class)->bustCache();
        app(SpecialPricingService::class)->bustCache();

        $html = $this->get('/')->assertOk()->getContent();

        $this->assertStringContainsString('product-img--circle', $html);
        $this->assertStringContainsString('id="offers"', $html);
        $this->assertMatchesRegularExpression('/class="price-sale"[^>]*>\s*\d+\.\d{2}\/-/', $html);
        $this->assertDoesNotMatchRegularExpression('/class="price-sale"[^>]*>\s*MVR\s*\d/', $html);
        $this->assertDoesNotMatchRegularExpression('/class="price-was"[^>]*>\s*MVR\s*\d/', $html);

        // Offers cards use brand placeholder — not the food emoji — when no image.
        $offersChunk = preg_match('/id="offers".*?<\/section>/s', $html, $m) ? $m[0] : '';
        $this->assertNotSame('', $offersChunk);
        $this->assertStringContainsString('product-img-placeholder--brand', $offersChunk);
        $this->assertStringNotContainsString('🍽️', $offersChunk);

        // Badge is a sibling of the circular image (not nested inside overflow:hidden).
        $this->assertMatchesRegularExpression(
            '/product-img--circle">\s*(?:<img[\s\S]*?<\/div>|<div class="product-img-placeholder[\s\S]*?<\/div>\s*)<\/div>\s*<div class="special-badge-stack"/',
            $offersChunk
        );
        $this->assertStringContainsString('20% OFF', $offersChunk);
        $this->assertStringContainsString(
            '.special-card .special-badge-stack',
            $html
        );
        // Placeholder logo is capped so a tall brand mark cannot oval the circle.
        $this->assertStringContainsString('max-height: 56%', $html);
        $this->assertStringContainsString('product-img-placeholder__logo', $html);
    }
}
