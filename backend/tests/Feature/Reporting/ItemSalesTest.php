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
 * Owner, 2026-10-27: "When i select an item, which time this item is bought in a
 * graph and different forms and different times, dates, months".
 */
class ItemSalesTest extends TestCase
{
    use RefreshDatabase;

    private Item $nescafe;

    private Variant $milk;

    private Variant $black;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->travelTo(CarbonImmutable::parse('2026-10-27 20:00:00'));
        $this->actingAs($this->makeOwner());

        $cat = Category::create(['name' => 'Drinks', 'is_active' => true]);
        $this->nescafe = Item::create(['name' => 'Nescafé', 'base_price' => 0, 'category_id' => $cat->id, 'is_active' => true, 'is_available' => true, 'has_variants' => true]);
        $this->black = Variant::create(['item_id' => $this->nescafe->id, 'name' => 'Black (PKT)', 'price' => 10, 'is_active' => true]);
        $this->milk = Variant::create(['item_id' => $this->nescafe->id, 'name' => 'Milk', 'price' => 15, 'is_active' => true]);

        // Tuesday 27th: two milk at 9, one black at 9, one milk takeaway at 15.
        $this->line('2026-10-27 09:05:00', $this->milk, 2);
        $this->line('2026-10-27 09:40:00', $this->black, 1);
        $this->line('2026-10-27 15:10:00', $this->milk, 1, 'takeaway');
        // Monday 26th at 9.
        $this->line('2026-10-26 09:20:00', $this->milk, 3);
        // The week before.
        $this->line('2026-10-19 09:00:00', $this->milk, 1);
    }

    private function line(string $at, Variant $v, int $qty, string $type = 'dine_in'): void
    {
        $order = Order::factory()->create(['status' => 'completed', 'type' => $type, 'total' => $qty * $v->price, 'created_at' => $at]);
        OrderItem::create(['order_id' => $order->id, 'item_id' => $this->nescafe->id, 'item_name' => 'Nescafé', 'variant_id' => $v->id, 'variant_name' => $v->name, 'quantity' => $qty, 'unit_price' => $v->price, 'total_price' => $qty * $v->price]);
    }

    public function test_when_an_item_sells_by_hour_weekday_and_over_time(): void
    {
        $res = $this->getJson("/api/reports/items-sold/{$this->nescafe->id}?from=2026-10-21&to=2026-10-27&group=day")->assertOk();

        $res->assertJsonPath('item.name', 'Nescafé')
            ->assertJsonPath('item.category', 'Drinks')
            ->assertJsonPath('totals.qty', 7)
            ->assertJsonPath('totals.sales', 100)
            ->assertJsonPath('totals.orders', 4)
            ->assertJsonPath('totals.per_day', 1)
            ->assertJsonPath('previous_totals.qty', 1);

        $this->assertSame(6.0, (float) $res->json('by_hour.9.qty'));
        $this->assertSame(1.0, (float) $res->json('by_hour.15.qty'));
        $this->assertSame(4.0, (float) $res->json('by_weekday.1.qty'), 'Tuesday');
        $this->assertSame(3.0, (float) $res->json('by_weekday.0.qty'), 'Monday');
        $this->assertSame(3.0, (float) $res->json('heatmap.1.9.qty'));

        $series = collect($res->json('series'))->keyBy('key');
        $this->assertCount(7, $series);
        $this->assertSame(4.0, (float) $series['2026-10-27']['items']);
        $this->assertCount(7, $res->json('previous_series'));

        $sizes = collect($res->json('by_size'))->keyBy('label');
        $this->assertSame(6.0, (float) $sizes['Milk']['qty']);
        $this->assertSame(1.0, (float) $sizes['Black (PKT)']['qty']);
        $types = collect($res->json('by_type'))->keyBy('label');
        $this->assertSame(1.0, (float) $types['takeaway']['qty']);
        $this->assertSame(['Black (PKT)', 'Milk'], array_column($res->json('item.sizes'), 'name'));
    }

    public function test_one_size_hours_and_months(): void
    {
        $this->getJson("/api/reports/items-sold/{$this->nescafe->id}?from=2026-10-21&to=2026-10-27&variant_id={$this->black->id}")
            ->assertOk()->assertJsonPath('totals.qty', 1);
        $this->getJson("/api/reports/items-sold/{$this->nescafe->id}?from=2026-10-21&to=2026-10-27&time_from=15:00&time_to=16:00")
            ->assertOk()->assertJsonPath('totals.qty', 1);
        $hours = $this->getJson("/api/reports/items-sold/{$this->nescafe->id}?from=2026-10-27&to=2026-10-27&group=hour")->assertOk();
        $this->assertCount(24, $hours->json('series'));
        $months = $this->getJson("/api/reports/items-sold/{$this->nescafe->id}?from=2026-08-01&to=2026-10-27&group=month")->assertOk();
        $this->assertSame(['2026-08', '2026-09', '2026-10'], array_column($months->json('series'), 'key'));
        $this->assertSame(8.0, (float) $months->json('series.2.items'));
    }

    public function test_an_unknown_item_and_staff_without_reports(): void
    {
        $this->getJson('/api/reports/items-sold/999999')->assertNotFound();
        $this->actingAs($this->makeKitchenStaff());
        $this->getJson("/api/reports/items-sold/{$this->nescafe->id}")->assertForbidden();
    }

    /** Owner, 2026-11-24: "a brief summary of the item in admin each item details. Like total sold". */
    public function test_the_brief_for_the_items_own_pop_up(): void
    {
        // Sold long ago, a cancelled one, and one paid but still in the kitchen.
        $this->line('2026-06-01 10:00:00', $this->black, 5);
        $this->line('2026-09-20 10:00:00', $this->black, 2);
        $gone = Order::factory()->create(['status' => 'cancelled', 'type' => 'dine_in', 'created_at' => '2026-10-27 11:00:00']);
        OrderItem::create(['order_id' => $gone->id, 'item_id' => $this->nescafe->id, 'item_name' => 'Nescafé', 'variant_id' => $this->milk->id, 'variant_name' => 'Milk', 'quantity' => 9, 'unit_price' => 15, 'total_price' => 135]);
        $paid = Order::factory()->create(['status' => 'ready', 'payment_status' => 'paid', 'type' => 'online_pickup', 'created_at' => '2026-10-27 12:00:00']);
        OrderItem::create(['order_id' => $paid->id, 'item_id' => $this->nescafe->id, 'item_name' => 'Nescafé', 'variant_id' => $this->milk->id, 'variant_name' => 'Milk', 'quantity' => 1, 'unit_price' => 15, 'total_price' => 15]);

        $res = $this->getJson("/api/reports/items-sold/{$this->nescafe->id}/brief")->assertOk();

        $res->assertJsonPath('days', 30)
            ->assertJsonPath('from', '2026-09-28')
            ->assertJsonPath('recent.qty', 9)
            ->assertJsonPath('recent.sales', 130)
            ->assertJsonPath('recent.orders', 6)
            ->assertJsonPath('before.qty', 2)
            ->assertJsonPath('all_time.qty', 16)
            ->assertJsonPath('first_sold', '2026-06-01')
            ->assertJsonPath('last_sold', '2026-10-27')
            ->assertJsonPath('reviews.count', 0)
            ->assertJsonPath('questions_waiting', 0);

        $sizes = collect($res->json('sizes'))->keyBy('label');
        $this->assertSame('Milk', $res->json('sizes.0.label'), 'the size that sold most lately comes first');
        $this->assertSame(8.0, (float) $sizes['Milk']['qty']);
        $this->assertSame(8.0, (float) $sizes['Milk']['all_qty']);
        $this->assertSame(1.0, (float) $sizes['Black (PKT)']['qty']);
        $this->assertSame(8.0, (float) $sizes['Black (PKT)']['all_qty']);
    }

    public function test_a_dish_never_sold_and_who_may_ask(): void
    {
        $tea = Item::create(['name' => 'Tea', 'base_price' => 8, 'is_active' => true, 'is_available' => true]);
        $this->getJson("/api/reports/items-sold/{$tea->id}/brief")->assertOk()
            ->assertJsonPath('all_time.qty', 0)
            ->assertJsonPath('last_sold', null)
            ->assertJsonPath('sizes', []);
        $this->getJson('/api/reports/items-sold/999999/brief')->assertNotFound();
        $this->actingAs($this->makeKitchenStaff());
        $this->getJson("/api/reports/items-sold/{$this->nescafe->id}/brief")->assertForbidden();
    }

    public function test_the_menu_list_carries_sold_and_sorts_by_it(): void
    {
        $tea = Item::create(['name' => 'Tea', 'base_price' => 8, 'is_active' => true, 'is_available' => true]);
        $bun = Item::create(['name' => 'Bun', 'base_price' => 5, 'is_active' => true, 'is_available' => true]);
        $order = Order::factory()->create(['status' => 'completed', 'type' => 'dine_in', 'created_at' => '2026-10-26 10:00:00']);
        OrderItem::create(['order_id' => $order->id, 'item_id' => $bun->id, 'item_name' => 'Bun', 'quantity' => 2, 'unit_price' => 5, 'total_price' => 10]);
        // Too long ago to count.
        $old = Order::factory()->create(['status' => 'completed', 'type' => 'dine_in', 'created_at' => '2026-08-01 10:00:00']);
        OrderItem::create(['order_id' => $old->id, 'item_id' => $tea->id, 'item_name' => 'Tea', 'quantity' => 50, 'unit_price' => 8, 'total_price' => 400]);

        \Laravel\Sanctum\Sanctum::actingAs($this->makeOwner(), ['staff']);
        $mine = fn ($res) => collect($res->json('data'))->whereIn('id', [$this->nescafe->id, $tea->id, $bun->id])->values();

        $best = $mine($this->getJson('/api/items?sort=sold_desc&per_page=100')->assertOk());
        $this->assertSame(['Nescafé', 'Bun', 'Tea'], $best->pluck('name')->all());
        $this->assertSame([8.0, 2.0, 0.0], $best->pluck('sold_30d')->map(fn ($v) => (float) $v)->all());

        $slow = $mine($this->getJson('/api/items?sort=sold&per_page=100')->assertOk());
        $this->assertSame(['Tea', 'Bun', 'Nescafé'], $slow->pluck('name')->all());

        // Without the reports, no figure and the menu's own order.
        \Laravel\Sanctum\Sanctum::actingAs($this->makeKitchenStaff(), ['staff']);
        $plain = $this->getJson('/api/items?sort=sold_desc&per_page=100')->assertOk();
        $this->assertArrayNotHasKey('sold_30d', $plain->json('data.0'));
        // And customers never see it.
        $this->app['auth']->forgetGuards();
        $this->assertArrayNotHasKey('sold_30d', $this->getJson('/api/items?view=customer')->assertOk()->json('data.0'));
    }
}
