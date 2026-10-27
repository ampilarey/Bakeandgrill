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
}
