<?php

declare(strict_types=1);

namespace Tests\Feature\Kitchen;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\ProductionCalendarPeriod;
use App\Models\SiteSetting;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-08: "Based on item selling date, time and the quantity
 * sold, is there any model to predict the items and quantity needed for a
 * specific time? For example for Friday evening we will need to make 50
 * bajiya." And: the start, middle and end of the month sell differently;
 * school and office holidays affect sales.
 *
 * Every test fixes "now" at Tuesday 2026-09-08 and plans for Friday the
 * 11th from the eight Fridays before it.
 */
class ProductionPlanTest extends TestCase
{
    use RefreshDatabase;

    private const NOW = '2026-09-08 10:00:00';

    private const FRIDAY = '2026-09-11';

    private Item $bajiya;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Carbon::setTestNow(Carbon::parse(self::NOW, config('app.timezone')));
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->bajiya = Item::factory()->create(['name' => 'Bajiya']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // ── Helpers ────────────────────────────────────────────────────────

    /** @return list<string> the last n same-weekday dates before $date, oldest first */
    private function previous(string $date, int $n): array
    {
        $out = [];
        $d = Carbon::parse($date)->subWeek();
        while (count($out) < $n) {
            $out[] = $d->toDateString();
            $d->subWeek();
        }

        return array_reverse($out);
    }

    private function sell(Item $item, string $when, int $qty, ?Customer $customer = null): Order
    {
        $at = Carbon::parse($when, config('app.timezone'));
        $order = Order::factory()->create([
            'status' => 'completed',
            'customer_id' => $customer?->id,
            'subtotal' => $qty * 5,
            'tax_amount' => 0,
            'total' => $qty * 5,
            'created_at' => $at,
            'updated_at' => $at,
            'completed_at' => $at,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $item->id,
            'item_name' => $item->name,
            'quantity' => $qty,
            'unit_price' => 5,
            'total_price' => $qty * 5,
        ]);

        return $order;
    }

    /** @return array<string, mixed> */
    private function planFor(string $date): array
    {
        return $this->getJson('/api/production-plan?date=' . $date)->assertOk()->json();
    }

    /**
     * @param array<string, mixed> $plan
     * @return array<string, mixed>|null
     */
    private function row(array $plan, Item $item): ?array
    {
        foreach ($plan['items'] as $row) {
            if ($row['item_id'] === $item->id && $row['variant_id'] === 0) {
                return $row;
            }
        }

        return null;
    }

    private function dial(Item $item, array $settings): void
    {
        $this->putJson("/api/production-plan/items/{$item->id}", $settings)->assertOk();
    }

    // ── The model ──────────────────────────────────────────────────────

    public function test_plans_friday_evening_from_fridays_alone(): void
    {
        foreach ($this->previous(self::FRIDAY, 8) as $friday) {
            $this->sell($this->bajiya, "{$friday} 19:00", 50);
            $this->sell($this->bajiya, "{$friday} 08:00", 20);
        }
        foreach ($this->previous('2026-09-14', 8) as $monday) {
            $this->sell($this->bajiya, "{$monday} 19:00", 10);
        }

        $plan = $this->planFor(self::FRIDAY);

        $this->assertSame('Friday', $plan['weekday']);
        $this->assertFalse($plan['closed']);
        $this->assertTrue($plan['history']['enough']);
        $this->assertSame(16, $plan['history']['open_days']);

        $row = $this->row($plan, $this->bajiya);
        $this->assertNotNull($row);
        $this->assertSame('Evening', $row['slots']['18']['label']);
        $this->assertEqualsWithDelta(50.0, $row['slots']['18']['forecast'], 0.01);
        $this->assertEqualsWithDelta(50.0, $row['slots']['18']['planned'], 0.01);
        $this->assertEqualsWithDelta(20.0, $row['slots']['6']['forecast'], 0.01);
        $this->assertEqualsWithDelta(0.0, $row['slots']['11']['forecast'], 0.01);
        $this->assertEqualsWithDelta(70.0, $row['day']['forecast'], 0.01);
        $this->assertSame(8, $row['day']['sample_days']);
        $this->assertCount(8, $row['slots']['18']['sample']);

        // Monday is its own animal.
        $monday = $this->row($this->planFor('2026-09-14'), $this->bajiya);
        $this->assertEqualsWithDelta(10.0, $monday['slots']['18']['forecast'], 0.01);
    }

    public function test_default_date_is_tomorrow_and_no_history_says_so(): void
    {
        $plan = $this->getJson('/api/production-plan')->assertOk()->json();

        $this->assertSame('2026-09-09', $plan['date']);
        $this->assertFalse($plan['history']['enough']);
        $this->assertSame(0, $plan['history']['open_days']);
        $this->assertSame([], $plan['items']);
    }

    public function test_service_level_is_a_dial(): void
    {
        $sold = [40, 45, 50, 55, 60, 42, 58, 48];
        foreach ($this->previous(self::FRIDAY, 8) as $i => $friday) {
            $this->sell($this->bajiya, "{$friday} 19:00", $sold[$i]);
        }

        $eightyFive = $this->row($this->planFor(self::FRIDAY), $this->bajiya);
        $this->assertSame(85, $eightyFive['service_level_pct']);

        $this->dial($this->bajiya, ['service_level_pct' => 50]);
        $fifty = $this->row($this->planFor(self::FRIDAY), $this->bajiya);
        $this->assertSame(50, $fifty['service_level_pct']);

        // Covering 85 days in 100 needs more than covering half of them.
        $this->assertGreaterThan($fifty['slots']['18']['forecast'], $eightyFive['slots']['18']['forecast']);
        $this->assertGreaterThanOrEqual(52, $eightyFive['slots']['18']['forecast']);
        $this->assertLessThanOrEqual(64, $eightyFive['slots']['18']['forecast']);
        $this->assertGreaterThanOrEqual(43, $fifty['slots']['18']['forecast']);
        $this->assertLessThanOrEqual(56, $fifty['slots']['18']['forecast']);
    }

    public function test_rounds_to_the_batch_and_keeps_the_floor(): void
    {
        foreach ($this->previous(self::FRIDAY, 8) as $friday) {
            $this->sell($this->bajiya, "{$friday} 19:00", 47);
        }

        $this->dial($this->bajiya, ['round_to' => 10]);
        $row = $this->row($this->planFor(self::FRIDAY), $this->bajiya);
        $this->assertEqualsWithDelta(47.0, $row['slots']['18']['forecast'], 0.01);
        $this->assertEqualsWithDelta(50.0, $row['slots']['18']['planned'], 0.01);

        $this->dial($this->bajiya, ['min_qty' => 80]);
        $row = $this->row($this->planFor(self::FRIDAY), $this->bajiya);
        $this->assertEqualsWithDelta(80.0, $row['day']['planned'], 0.01);
        // The top-up lands on the slot that was already the biggest.
        $this->assertEqualsWithDelta(80.0, $row['slots']['18']['planned'], 0.01);
    }

    public function test_start_of_the_month_sells_more_and_the_plan_knows_it(): void
    {
        // Pay day: the first ten days of the month sell double.
        foreach ($this->previous(self::FRIDAY, 8) as $friday) {
            $qty = Carbon::parse($friday)->day <= 10 ? 80 : 40;
            $this->sell($this->bajiya, "{$friday} 19:00", $qty);
        }
        $this->dial($this->bajiya, ['service_level_pct' => 50]);

        $mid = $this->row($this->planFor(self::FRIDAY), $this->bajiya);      // the 11th
        $start = $this->row($this->planFor('2026-10-02'), $this->bajiya);   // the 2nd

        $this->assertSame('mid', $this->planFor(self::FRIDAY)['month_position']['key']);
        $this->assertSame('start', $this->planFor('2026-10-02')['month_position']['key']);
        $this->assertGreaterThan(1.0, $start['factors']['month_position']['start']['index']);
        $this->assertLessThan(1.0, $mid['factors']['month_position']['mid']['index']);
        $this->assertGreaterThan($mid['slots']['18']['forecast'], $start['slots']['18']['forecast']);
        $this->assertLessThan(50, $mid['slots']['18']['forecast']);
        $this->assertGreaterThan(45, $start['slots']['18']['forecast']);
    }

    public function test_a_holiday_kind_is_learned_from_the_days_it_has_seen(): void
    {
        $fridays = $this->previous(self::FRIDAY, 8);
        $holidays = [$fridays[1], $fridays[3], $fridays[5]];
        foreach ($fridays as $friday) {
            $onHoliday = in_array($friday, $holidays, true);
            $this->sell($this->bajiya, "{$friday} 19:00", $onHoliday ? 25 : 50);
            if ($onHoliday) {
                ProductionCalendarPeriod::create([
                    'kind' => 'public_holiday', 'label' => 'Holiday', 'starts_on' => $friday, 'ends_on' => $friday,
                ]);
            }
        }
        ProductionCalendarPeriod::create([
            'kind' => 'public_holiday', 'label' => 'National day', 'starts_on' => self::FRIDAY, 'ends_on' => self::FRIDAY,
        ]);

        $plan = $this->planFor(self::FRIDAY);
        $this->assertSame('public_holiday', $plan['calendar'][0]['kind']);
        $this->assertSame('National day', $plan['calendar'][0]['label']);

        $row = $this->row($plan, $this->bajiya);
        $meta = $row['factors']['calendar']['public_holiday'];
        $this->assertSame(3, $meta['days_seen']);
        $this->assertEqualsWithDelta(0.5, $meta['learned'], 0.02);
        // Three days of evidence, pulled towards "no effect" by four phantom
        // ordinary days: (3 × 0.5 + 4 × 1) / 7.
        $this->assertEqualsWithDelta(5.5 / 7, $meta['index'], 0.01);
        $this->assertEqualsWithDelta(50 * 5.5 / 7, $row['slots']['18']['forecast'], 1.0);
    }

    public function test_an_unseen_holiday_kind_uses_the_typed_expectation(): void
    {
        foreach ($this->previous(self::FRIDAY, 8) as $friday) {
            $this->sell($this->bajiya, "{$friday} 19:00", 50);
        }
        ProductionCalendarPeriod::create([
            'kind' => 'office_holiday', 'label' => 'Government holiday',
            'starts_on' => '2026-09-18', 'ends_on' => '2026-09-18', 'expected_change_pct' => -40,
        ]);

        $plan = $this->planFor('2026-09-18');
        $this->assertSame(-40, $plan['calendar'][0]['expected_change_pct']);

        $row = $this->row($plan, $this->bajiya);
        $this->assertSame(0, $row['factors']['calendar']['office_holiday']['days_seen']);
        $this->assertEqualsWithDelta(0.6, $row['factors']['calendar']['office_holiday']['index'], 0.001);
        $this->assertEqualsWithDelta(30.0, $row['slots']['18']['forecast'], 0.5);

        // Without an expectation, an unseen kind changes nothing.
        ProductionCalendarPeriod::query()->update(['expected_change_pct' => null]);
        $row = $this->row($this->planFor('2026-09-18'), $this->bajiya);
        $this->assertEqualsWithDelta(50.0, $row['slots']['18']['forecast'], 0.01);
    }

    public function test_closed_days_are_not_evidence_and_a_closed_target_plans_nothing(): void
    {
        $fridays = $this->previous(self::FRIDAY, 8);
        foreach ($fridays as $i => $friday) {
            // Four half-days that were really closures.
            $this->sell($this->bajiya, "{$friday} 19:00", $i % 2 === 0 ? 5 : 50);
            if ($i % 2 === 0) {
                ProductionCalendarPeriod::create(['kind' => 'closed', 'label' => 'Shut', 'starts_on' => $friday, 'ends_on' => $friday]);
            }
        }
        $this->dial($this->bajiya, ['service_level_pct' => 50]);

        $row = $this->row($this->planFor(self::FRIDAY), $this->bajiya);
        $this->assertSame(4, $row['day']['sample_days']);
        $this->assertEqualsWithDelta(50.0, $row['slots']['18']['forecast'], 0.01);

        SiteSetting::set('business_closures_json', json_encode([self::FRIDAY => 'Staff outing']));
        $plan = $this->planFor(self::FRIDAY);
        $this->assertTrue($plan['closed']);
        $this->assertSame('Staff outing', $plan['closed_reason']);
        $this->assertSame([], $plan['items']);
    }

    public function test_a_sold_out_evening_is_a_floor_not_a_measure(): void
    {
        $fridays = $this->previous(self::FRIDAY, 8);
        foreach ($fridays as $i => $friday) {
            if ($i % 2 === 0) {
                // Twenty went, then the KDS marked it 86 at half past six.
                $this->sell($this->bajiya, "{$friday} 18:10", 20);
                $this->log86($friday . ' 18:30:00', 'item.86');
                $this->log86(Carbon::parse($friday)->addDay()->toDateString() . ' 07:00:00', 'item.un86');
            } else {
                $this->sell($this->bajiya, "{$friday} 19:00", 50);
            }
        }
        $this->dial($this->bajiya, ['service_level_pct' => 50]);

        $row = $this->row($this->planFor(self::FRIDAY), $this->bajiya);
        $slot = $row['slots']['18'];

        $this->assertSame(4, $slot['sold_out_days']);
        $this->assertGreaterThanOrEqual(45, $slot['forecast']);
        $soldOut = array_values(array_filter($slot['sample'], fn (array $s) => $s['sold_out']));
        $this->assertCount(4, $soldOut);
        $this->assertSame('18:30', $soldOut[0]['sold_out_at']);
        $this->assertEqualsWithDelta(50.0, $soldOut[0]['lifted_to'], 0.5);
        // The morning was never sold out.
        $this->assertSame(0, $row['slots']['6']['sold_out_days']);
    }

    public function test_orders_already_placed_for_the_day_are_a_floor(): void
    {
        foreach ($this->previous(self::FRIDAY, 8) as $friday) {
            $this->sell($this->bajiya, "{$friday} 19:00", 50);
        }
        $order = Order::factory()->create([
            'status' => 'pending',
            'customer_id' => null,
            'fulfil_date' => self::FRIDAY,
            'pickup_slot_at' => Carbon::parse(self::FRIDAY . ' 19:00', config('app.timezone')),
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'item_id' => $this->bajiya->id, 'item_name' => 'Bajiya',
            'quantity' => 70, 'unit_price' => 5, 'total_price' => 350,
        ]);

        $row = $this->row($this->planFor(self::FRIDAY), $this->bajiya);

        $this->assertEqualsWithDelta(70.0, $row['slots']['18']['known'], 0.01);
        $this->assertEqualsWithDelta(70.0, $row['slots']['18']['planned'], 0.01);
        $this->assertEqualsWithDelta(70.0, $row['day']['known'], 0.01);
    }

    public function test_what_registered_customers_add(): void
    {
        $regular = Customer::factory()->create(['name' => 'Aishath']);
        foreach ($this->previous(self::FRIDAY, 8) as $friday) {
            $this->sell($this->bajiya, "{$friday} 19:00", 10, $regular);
            $this->sell($this->bajiya, "{$friday} 19:30", 40);
        }

        $row = $this->row($this->planFor(self::FRIDAY), $this->bajiya);

        $this->assertSame(20, $row['customers']['registered_share_pct']);
        $this->assertSame(1, $row['customers']['buyers']);
        $this->assertSame(1, $row['customers']['regulars']);
        $this->assertEqualsWithDelta(10.0, $row['customers']['regulars_weekly_qty'], 0.01);
        $this->assertEqualsWithDelta(10.0, $row['customers']['regulars_same_weekday_avg'], 0.01);
        // And nothing that names them.
        $this->assertArrayNotHasKey('name', $row['customers']);
        $this->assertStringNotContainsString('Aishath', json_encode($row));
    }

    public function test_reviewing_a_past_day_shows_what_sold(): void
    {
        foreach ($this->previous('2026-09-07', 8) as $monday) {
            $this->sell($this->bajiya, "{$monday} 19:00", 30);
        }
        $this->sell($this->bajiya, '2026-09-07 19:00', 26);

        $plan = $this->planFor('2026-09-07');
        $this->assertTrue($plan['is_past']);

        $row = $this->row($plan, $this->bajiya);
        $this->assertEqualsWithDelta(30.0, $row['slots']['18']['forecast'], 0.01);
        $this->assertEqualsWithDelta(26.0, $row['slots']['18']['actual'], 0.01);
        $this->assertFalse($row['slots']['18']['actual_sold_out']);
        $this->assertEqualsWithDelta(26.0, $row['day']['actual'], 0.01);
    }

    private function log86(string $at, string $action): void
    {
        $log = new AuditLog([
            'action' => $action,
            'model_type' => 'Item',
            'model_id' => $this->bajiya->id,
            'old_values' => [],
            'new_values' => ['is_available' => $action === 'item.un86'],
            'meta' => ['source' => 'kds'],
        ]);
        $log->created_at = Carbon::parse($at, config('app.timezone'));
        $log->updated_at = $log->created_at;
        $log->save();
    }
}
