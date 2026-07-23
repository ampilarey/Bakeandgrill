<?php

declare(strict_types=1);

namespace Tests\Feature\Offers;

use App\Domains\Promotions\Services\OffersService;
use App\Models\Category;
use App\Models\DailySpecial;
use App\Models\Item;
use App\Models\Promotion;
use App\Models\PromotionTarget;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OffersEndpointTest extends TestCase
{
    use RefreshDatabase;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        $category = Category::create(['name' => 'Food', 'slug' => 'food-off', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Burger',
            'base_price' => 100.00,
            'sku' => 'OFF-B001',
            'barcode' => 'OFF-B001',
            'is_active' => true,
            'is_available' => true,
        ]);
    }

    public function test_offers_empty_when_none(): void
    {
        $this->getJson('/api/offers')
            ->assertOk()
            ->assertJsonPath('offers', []);
    }

    public function test_offers_aggregates_specials_and_auto_promos(): void
    {
        DailySpecial::create([
            'item_id' => $this->item->id,
            'is_active' => true,
            'start_date' => today()->toDateString(),
            'end_date' => today()->toDateString(),
            'discount_pct' => 20,
            'badge_label' => 'Special Offer',
        ]);

        $promo = Promotion::create([
            'name' => 'Auto 10%',
            'code' => null,
            'type' => 'percentage',
            'discount_value' => 10,
            'is_active' => true,
            'auto_apply' => true,
            'scope' => 'item',
        ]);
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $this->item->id,
            'is_exclusion' => false,
        ]);

        app(OffersService::class)->bustCache();
        app(\App\Services\SpecialPricingService::class)->bustCache();

        $response = $this->getJson('/api/offers')->assertOk();
        $offers = $response->json('offers');
        $this->assertNotEmpty($offers);
        $kinds = collect($offers)->pluck('kind')->unique()->values()->all();
        $this->assertContains('special', $kinds);
        $this->assertContains('promo', $kinds);
    }

    public function test_offers_cache_busts_on_promo_change(): void
    {
        $this->getJson('/api/offers')->assertJsonPath('offers', []);

        Promotion::create([
            'name' => 'Order 5%',
            'code' => null,
            'type' => 'percentage',
            'discount_value' => 5,
            'is_active' => true,
            'auto_apply' => true,
            'scope' => 'order',
        ]);

        $response = $this->getJson('/api/offers')->assertOk();
        $this->assertNotEmpty($response->json('offers'));
    }
}
