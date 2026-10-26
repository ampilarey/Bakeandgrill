<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Domains\Menu\Support\BestSellerCards;
use App\Models\Category;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Variant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * Owner, 2026-10-26: "cant u show variants in best selers?" The website
 * home's Best Sellers show each size as its own card, named and at its own
 * price, ranked by its own sales, as every report treats a size.
 */
class BestSellerVariantsTest extends TestCase
{
    use RefreshDatabase;

    private Item $nescafe;

    private Variant $milk;

    private Variant $black;

    private Item $bajiya;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        MenuGroup::firstOrCreate(['id' => 1], ['name' => 'Default', 'slug' => 'default', 'sort_order' => 0, 'is_active' => true]);
        $cat = Category::create(['name' => 'Drinks', 'is_active' => true]);
        $this->nescafe = Item::create(['name' => 'Nescafé', 'base_price' => 0, 'is_active' => true, 'is_available' => true, 'category_id' => $cat->id, 'has_variants' => true, 'menu_group_id' => 1]);
        $this->black = Variant::create(['item_id' => $this->nescafe->id, 'name' => 'Black (PKT)', 'price' => 10, 'is_active' => true]);
        $this->milk = Variant::create(['item_id' => $this->nescafe->id, 'name' => 'Milk', 'price' => 15, 'is_active' => true]);
        $this->bajiya = Item::create(['name' => 'Bajiya', 'base_price' => 5, 'is_active' => true, 'is_available' => true, 'category_id' => $cat->id, 'has_variants' => false, 'menu_group_id' => 1]);

        $this->sold($this->nescafe, $this->milk, 4);
        $this->sold($this->bajiya, null, 3);
        $this->sold($this->nescafe, $this->black, 2);
    }

    private function sold(Item $item, ?Variant $variant, int $lines, string $status = 'completed'): void
    {
        for ($i = 0; $i < $lines; $i++) {
            $order = Order::factory()->create(['status' => $status, 'created_at' => now()->subMinutes(10 + $i)]);
            OrderItem::create([
                'order_id' => $order->id,
                'item_id' => $item->id,
                'item_name' => $item->name,
                'variant_id' => $variant?->id,
                'variant_name' => $variant?->name,
                'quantity' => 1,
                'unit_price' => $variant?->price ?? $item->base_price,
                'total_price' => $variant?->price ?? $item->base_price,
            ]);
        }
    }

    public function test_each_size_is_its_own_card_ranked_by_its_own_sales(): void
    {
        $cards = BestSellerCards::top();

        $this->assertSame(
            [['Nescafé', 'Milk', 4], ['Bajiya', null, 3], ['Nescafé', 'Black (PKT)', 2]],
            $cards->map(fn (Item $c) => [$c->name, $c->getRelation('bestVariant')?->name, $c->order_items_count])->all(),
        );
        $this->assertSame(['price' => 15.0, 'from' => false], BestSellerCards::price($cards[0]));
        $this->assertSame(['price' => 5.0, 'from' => false], BestSellerCards::price($cards[1]));
        $this->assertSame(['price' => 10.0, 'from' => false], BestSellerCards::price($cards[2]));
    }

    public function test_the_home_page_names_the_size_at_its_own_price(): void
    {
        $html = $this->get('/')->assertOk()->getContent();

        $this->assertStringContainsString('<div class="product-size">Milk</div>', $html);
        $this->assertStringContainsString('<div class="product-size">Black (PKT)</div>', $html);
        $this->assertStringContainsString('15.00', $html);
        $this->assertStringNotContainsString('product-from', $html, 'a size card never says From');
    }

    public function test_a_size_switched_off_and_cancelled_orders_do_not_count(): void
    {
        $this->milk->update(['is_active' => false]);
        $this->sold($this->bajiya, null, 5, 'cancelled');

        $cards = BestSellerCards::top();

        $this->assertSame(
            [['Bajiya', null], ['Nescafé', 'Black (PKT)']],
            $cards->map(fn (Item $c) => [$c->name, $c->getRelation('bestVariant')?->name])->all(),
        );
        $this->assertSame(3, $cards[0]->order_items_count);
    }
}
