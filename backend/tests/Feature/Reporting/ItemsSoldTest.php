<?php

declare(strict_types=1);

namespace Tests\Feature\Reporting;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Variant;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Owner, 2026-10-27: "how can i see all the items sold by a specific date and
 * specific time of preiod, with or without cattegory".
 */
class ItemsSoldTest extends TestCase
{
    use RefreshDatabase;

    private Category $drinks;

    private Category $hot;

    private Category $snacks;

    private Item $nescafe;

    private Item $bajiya;

    private Variant $milk;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->travelTo(CarbonImmutable::parse('2026-10-27 20:00:00'));
        $this->actingAs($this->makeOwner());

        $this->drinks = Category::create(['name' => 'Drinks', 'is_active' => true]);
        $this->hot = Category::create(['name' => 'Hot', 'parent_id' => $this->drinks->id, 'is_active' => true]);
        $this->snacks = Category::create(['name' => 'Snacks', 'is_active' => true]);
        $this->nescafe = Item::create(['name' => 'Nescafé', 'base_price' => 0, 'category_id' => $this->hot->id, 'is_active' => true, 'is_available' => true, 'has_variants' => true]);
        $this->milk = Variant::create(['item_id' => $this->nescafe->id, 'name' => 'Milk', 'price' => 15, 'is_active' => true]);
        $this->bajiya = Item::create(['name' => 'Bajiya', 'base_price' => 5, 'category_id' => $this->snacks->id, 'is_active' => true, 'is_available' => true]);

        $this->line('2026-10-27 09:10:00', $this->nescafe, 2, 15, $this->milk);
        $this->line('2026-10-27 15:30:00', $this->bajiya, 6, 5);
        $this->line('2026-10-27 15:45:00', $this->nescafe, 1, 15, $this->milk);
        $this->line('2026-10-26 15:40:00', $this->bajiya, 4, 5); // the day before
        $this->line('2026-10-27 16:00:00', $this->bajiya, 50, 5, null, 'cancelled'); // never a sale
    }

    private function line(string $at, Item $item, int $qty, float $price, ?Variant $variant = null, string $status = 'completed'): void
    {
        $order = Order::factory()->create(['status' => $status, 'type' => 'dine_in', 'total' => $qty * $price, 'total_laar' => (int) ($qty * $price * 100), 'created_at' => $at]);
        OrderItem::create([
            'order_id' => $order->id, 'item_id' => $item->id, 'item_name' => $item->name,
            'variant_id' => $variant?->id, 'variant_name' => $variant?->name,
            'quantity' => $qty, 'unit_price' => $price, 'total_price' => $qty * $price,
        ]);
    }

    public function test_every_item_on_a_day_each_size_apart_with_its_category(): void
    {
        $res = $this->getJson('/api/reports/items-sold?from=2026-10-27&to=2026-10-27')->assertOk();

        $res->assertJsonPath('totals.sales', 75)
            ->assertJsonPath('totals.qty', 9)
            ->assertJsonPath('totals.orders', 3)
            ->assertJsonPath('totals.items', 2);
        $items = collect($res->json('items'))->keyBy('name');
        $this->assertSame(45.0, (float) $items['Nescafé (Milk)']['sales']);
        $this->assertSame('Drinks › Hot', $items['Nescafé (Milk)']['category']);
        $this->assertSame(2, $items['Nescafé (Milk)']['orders']);
        $this->assertSame(30.0, (float) $items['Bajiya']['sales']);
        $this->assertSame(5.0, (float) $items['Bajiya']['avg_price']);
        $this->assertSame(60.0, (float) $items['Nescafé (Milk)']['share']);

        $cats = collect($res->json('categories'))->keyBy('category');
        $this->assertSame(45.0, (float) $cats['Drinks › Hot']['sales']);
        $this->assertContains('Drinks › Hot', array_column($res->json('category_choices'), 'name'));
    }

    public function test_a_time_of_day_on_each_day_of_the_period(): void
    {
        // 3 PM to 6 PM on the 26th and the 27th.
        $res = $this->getJson('/api/reports/items-sold?from=2026-10-26&to=2026-10-27&time_from=15:00&time_to=18:00')->assertOk();
        $items = collect($res->json('items'))->keyBy('name');
        $this->assertSame(10.0, (float) $items['Bajiya']['qty']);
        $this->assertSame(1.0, (float) $items['Nescafé (Milk)']['qty'], 'the 9 AM coffees are outside the hours');

        // A window past midnight takes the morning side too.
        $late = $this->getJson('/api/reports/items-sold?from=2026-10-27&to=2026-10-27&time_from=22:00&time_to=09:30')->assertOk();
        $this->assertSame(['Nescafé (Milk)'], array_column($late->json('items'), 'name'));
    }

    public function test_one_category_takes_its_sub_categories(): void
    {
        $res = $this->getJson('/api/reports/items-sold?from=2026-10-27&to=2026-10-27&category_id=' . $this->drinks->id)->assertOk();
        $this->assertSame(['Nescafé (Milk)'], array_column($res->json('items'), 'name'));
        $res->assertJsonPath('totals.sales', 45);
    }

    public function test_bad_times_are_refused_and_it_needs_reports_view(): void
    {
        $this->getJson('/api/reports/items-sold?time_from=25:00&time_to=10:00')->assertUnprocessable();
        $this->getJson('/api/reports/items-sold?time_from=10:00')->assertUnprocessable();
        $this->actingAs($this->makeKitchenStaff());
        $this->getJson('/api/reports/items-sold')->assertForbidden();
    }
}
