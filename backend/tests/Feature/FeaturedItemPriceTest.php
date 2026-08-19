<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Item;
use App\Models\Variant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Owner, 2026-08-19: the website's featured strip showed "Coke — MVR 0.00"
 * while the order app's item sheet correctly showed "From 15.00/-".
 *
 * An item with sizes keeps its money on the variants and leaves base_price at
 * 0, so printing base_price advertises a real product as free. The featured
 * card now asks the model, which mirrors the order app's ProductCard: lowest
 * ACTIVE variant, marked as a "from" price.
 */
class FeaturedItemPriceTest extends TestCase
{
    use RefreshDatabase;

    private function item(array $attrs = []): Item
    {
        $category = Category::firstOrCreate(
            ['slug' => 'feat-drinks'],
            ['name' => 'Cold Drinks', 'is_active' => true],
        );

        return Item::create(array_merge([
            'category_id' => $category->id,
            'name' => 'Coke',
            'base_price' => 0,
            'sku' => 'FEAT-' . str()->random(5),
            'is_active' => true,
            'is_available' => true,
        ], $attrs));
    }

    public function test_a_sized_item_shows_its_cheapest_size_not_zero(): void
    {
        $coke = $this->item(['has_variants' => true]);
        Variant::create(['item_id' => $coke->id, 'name' => 'Large', 'price' => 25.00, 'is_active' => true, 'sort_order' => 1]);
        Variant::create(['item_id' => $coke->id, 'name' => 'Small', 'price' => 15.00, 'is_active' => true, 'sort_order' => 2]);

        $info = $coke->load('variants')->displayPriceInfo();

        $this->assertSame(15.0, $info['price'], 'the card must show the cheapest size, never base_price 0');
        $this->assertTrue($info['from'], 'and say "From", because 15.00 is not the only price');
    }

    public function test_an_inactive_size_is_not_offered_as_the_from_price(): void
    {
        // A size nobody can order must not set the advertised price.
        $coke = $this->item(['has_variants' => true]);
        Variant::create(['item_id' => $coke->id, 'name' => 'Retired', 'price' => 5.00, 'is_active' => false, 'sort_order' => 1]);
        Variant::create(['item_id' => $coke->id, 'name' => 'Small', 'price' => 15.00, 'is_active' => true, 'sort_order' => 2]);

        $this->assertSame(15.0, $coke->load('variants')->displayPriceInfo()['price']);
    }

    public function test_a_plain_item_still_shows_its_own_price(): void
    {
        $bun = $this->item(['name' => 'Bun', 'base_price' => 8.50]);

        $info = $bun->load('variants')->displayPriceInfo();

        $this->assertSame(8.5, $info['price']);
        $this->assertFalse($info['from'], 'one price is not a "from" price');
    }

    public function test_a_sized_item_with_no_usable_sizes_falls_back_rather_than_crashing(): void
    {
        $odd = $this->item(['name' => 'Broken', 'base_price' => 12.00, 'has_variants' => true]);
        Variant::create(['item_id' => $odd->id, 'name' => 'Gone', 'price' => 5.00, 'is_active' => false, 'sort_order' => 1]);

        $this->assertSame(12.0, $odd->load('variants')->displayPriceInfo()['price']);
    }

    /**
     * The accessor only reaches for variants when they are loaded, so a
     * controller that forgets to eager-load them silently reverts to the bug.
     */
    public function test_the_home_page_prints_a_from_price_for_a_sized_item(): void
    {
        $coke = $this->item(['has_variants' => true]);
        Variant::create(['item_id' => $coke->id, 'name' => 'Small', 'price' => 15.00, 'is_active' => true, 'sort_order' => 1]);
        Variant::create(['item_id' => $coke->id, 'name' => 'Large', 'price' => 25.00, 'is_active' => true, 'sort_order' => 2]);

        $html = $this->get('/')->assertOk()->getContent();

        $this->assertStringContainsString('15.00', $html);
        $this->assertStringNotContainsString(
            '<span class="product-price">0.00</span>',
            $html,
            'a sized item must never be advertised at MVR 0.00',
        );
    }
}
