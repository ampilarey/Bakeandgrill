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

    /**
     * A category-wide deal used to be a card carrying the promotion's admin
     * name and no photo. It now names the category and wears its picture.
     */
    public function test_a_category_wide_promo_card_names_the_category_and_wears_its_photo(): void
    {
        $category = Category::query()->where('slug', 'food-off')->firstOrFail();
        $category->update(['image_url' => '/storage/categories/food.jpg']);

        $promo = Promotion::create([
            'name' => 'Sept food push',
            'code' => null,
            'type' => 'percentage',
            'discount_value' => 15,
            'is_active' => true,
            'auto_apply' => true,
            'scope' => 'item',
        ]);
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'category',
            'target_id' => $category->id,
            'is_exclusion' => false,
        ]);
        app(OffersService::class)->bustCache();

        $offers = $this->getJson('/api/offers')->assertOk()->json('offers');
        $this->assertCount(1, $offers);
        $this->assertSame('Food', $offers[0]['title']);
        $this->assertSame('15% OFF', $offers[0]['badge']);
        $this->assertSame('/storage/categories/food.jpg', $offers[0]['image_url']);
        $this->assertSame('category', $offers[0]['target']['type']);
    }

    /**
     * The strip leads with the deal most worth a tap: biggest saving first,
     * and a cart-level deal, which has no price to show, last of all.
     */
    public function test_offers_are_ranked_biggest_saving_first_with_cart_deals_last(): void
    {
        $category = Category::query()->where('slug', 'food-off')->firstOrFail();
        $small = Item::create([
            'category_id' => $category->id,
            'name' => 'Small deal',
            'base_price' => 100.00,
            'sku' => 'OFF-S001',
            'barcode' => 'OFF-S001',
            'is_active' => true,
            'is_available' => true,
        ]);

        // Built first, smallest saving: 10% on one item.
        DailySpecial::create([
            'item_id' => $small->id,
            'is_active' => true,
            'start_date' => today()->toDateString(),
            'end_date' => today()->toDateString(),
            'discount_pct' => 10,
        ]);
        // Cart-level 50%: no price to show, so it goes last however large.
        Promotion::create([
            'name' => 'Half off everything',
            'code' => null,
            'type' => 'percentage',
            'discount_value' => 50,
            'is_active' => true,
            'auto_apply' => true,
            'scope' => 'order',
        ]);
        // Built last, biggest saving on a real price: 30% on the burger.
        $big = Promotion::create([
            'name' => 'Burger 30',
            'code' => null,
            'type' => 'percentage',
            'discount_value' => 30,
            'is_active' => true,
            'auto_apply' => true,
            'scope' => 'item',
        ]);
        PromotionTarget::create([
            'promotion_id' => $big->id,
            'target_type' => 'item',
            'target_id' => $this->item->id,
            'is_exclusion' => false,
        ]);
        app(OffersService::class)->bustCache();
        app(\App\Services\SpecialPricingService::class)->bustCache();

        $offers = $this->getJson('/api/offers')->assertOk()->json('offers');
        $this->assertSame(
            ['Burger', 'Small deal', 'Half off everything'],
            array_column($offers, 'title'),
        );
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
