<?php

declare(strict_types=1);

namespace Tests\Feature\Kitchen;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\ProductionPlanRecord;
use App\Models\Role;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The plan's surroundings: who may see it, the holiday calendar, the
 * settings, saving a plan and marking it against what sold, and the
 * customer-habits summary.
 */
class ProductionPlanAdminTest extends TestCase
{
    use RefreshDatabase;

    private const NOW = '2026-09-08 10:00:00';

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['owner' => 'Owner', 'manager' => 'Manager', 'staff' => 'Staff', 'kitchen_staff' => 'Kitchen Staff'] as $slug => $name) {
            Role::firstOrCreate(['slug' => $slug], ['name' => $name, 'is_active' => true]);
        }
        PermissionCatalogSync::sync();
        Carbon::setTestNow(Carbon::parse(self::NOW, config('app.timezone')));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function userWithRole(string $role): User
    {
        return User::create([
            'name' => ucfirst($role),
            'email' => $role . '-' . uniqid() . '@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', $role)->firstOrFail()->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
    }

    private function sell(Item $item, string $when, int $qty, ?Customer $customer = null): void
    {
        $at = Carbon::parse($when, config('app.timezone'));
        $order = Order::factory()->create([
            'status' => 'completed',
            'customer_id' => $customer?->id,
            'subtotal' => $qty * 5, 'tax_amount' => 0, 'total' => $qty * 5,
            'created_at' => $at, 'updated_at' => $at, 'completed_at' => $at,
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'item_id' => $item->id, 'item_name' => $item->name,
            'quantity' => $qty, 'unit_price' => 5, 'total_price' => $qty * 5,
        ]);
    }

    // ── Who may ────────────────────────────────────────────────────────

    public function test_the_cook_can_read_the_plan_but_not_change_the_calendar(): void
    {
        Sanctum::actingAs($this->userWithRole('kitchen_staff'), ['staff']);

        $this->getJson('/api/production-plan')->assertOk();
        $this->getJson('/api/production-plan/calendar')->assertOk();
        $this->postJson('/api/production-plan/calendar', [
            'kind' => 'public_holiday', 'starts_on' => '2026-09-11', 'ends_on' => '2026-09-11',
        ])->assertForbidden();
        $this->putJson('/api/production-plan/settings', ['lookback_weeks' => 10])->assertForbidden();
    }

    public function test_a_cashier_has_no_business_with_it(): void
    {
        Sanctum::actingAs($this->userWithRole('staff'), ['staff']);

        $this->getJson('/api/production-plan')->assertForbidden();
    }

    public function test_the_manager_can_do_all_of_it(): void
    {
        Sanctum::actingAs($this->userWithRole('manager'), ['staff']);

        $this->getJson('/api/production-plan')->assertOk();
        $this->postJson('/api/production-plan/calendar', [
            'kind' => 'public_holiday', 'starts_on' => '2026-09-11', 'ends_on' => '2026-09-11',
        ])->assertCreated();
    }

    // ── Calendar ───────────────────────────────────────────────────────

    public function test_calendar_periods_can_be_kept(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $created = $this->postJson('/api/production-plan/calendar', [
            'kind' => 'school_holiday',
            'label' => 'Mid-term break',
            'starts_on' => '2026-09-20',
            'ends_on' => '2026-09-27',
            'expected_change_pct' => -20,
            'notes' => 'Schools shut for a week.',
        ])->assertCreated()->json('period');

        $this->assertSame('School holiday', $created['kind_label']);
        $this->assertSame(8, $created['days']);
        $this->assertSame(-20, $created['expected_change_pct']);

        $list = $this->getJson('/api/production-plan/calendar?from=2026-09-01&to=2026-09-30')->assertOk()->json();
        $this->assertCount(1, $list['periods']);
        $this->assertSame('Mid-term break', $list['periods'][0]['label']);
        $this->assertArrayHasKey('school_holiday', $list['kinds']);

        // Outside the window it is not listed.
        $this->assertCount(0, $this->getJson('/api/production-plan/calendar?from=2026-10-01&to=2026-10-31')->json('periods'));

        $this->patchJson("/api/production-plan/calendar/{$created['id']}", ['ends_on' => '2026-09-19'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('ends_on');

        $this->patchJson("/api/production-plan/calendar/{$created['id']}", ['ends_on' => '2026-09-30', 'expected_change_pct' => null])
            ->assertOk()
            ->assertJsonPath('period.ends_on', '2026-09-30')
            ->assertJsonPath('period.expected_change_pct', null);

        $this->deleteJson("/api/production-plan/calendar/{$created['id']}")->assertOk();
        $this->assertDatabaseMissing('production_calendar_periods', ['id' => $created['id']]);
    }

    public function test_calendar_validation(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->postJson('/api/production-plan/calendar', [
            'kind' => 'bank_holiday', 'starts_on' => '2026-09-11', 'ends_on' => '2026-09-11',
        ])->assertStatus(422)->assertJsonValidationErrors('kind');

        $this->postJson('/api/production-plan/calendar', [
            'kind' => 'eid', 'starts_on' => '2026-09-11', 'ends_on' => '2026-09-10',
        ])->assertStatus(422)->assertJsonValidationErrors('ends_on');

        $this->postJson('/api/production-plan/calendar', [
            'kind' => 'eid', 'starts_on' => '2026-09-11', 'ends_on' => '2026-09-12', 'expected_change_pct' => 500,
        ])->assertStatus(422)->assertJsonValidationErrors('expected_change_pct');
    }

    // ── Settings ───────────────────────────────────────────────────────

    public function test_settings_start_from_the_defaults_and_can_be_changed(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $settings = $this->getJson('/api/production-plan/settings')->assertOk()->json('settings');
        $this->assertSame(12, $settings['lookback_weeks']);
        $this->assertSame(8, $settings['sample_weeks']);
        $this->assertSame(85, $settings['default_service_level_pct']);
        $this->assertCount(5, $settings['slots']);
        $this->assertSame('Morning', $settings['slots'][0]['label']);

        // A day that is not fully covered is refused.
        $this->putJson('/api/production-plan/settings', [
            'slots' => [['label' => 'Day', 'from' => 7, 'to' => 21]],
        ])->assertStatus(422)->assertJsonValidationErrors('slots');

        $this->putJson('/api/production-plan/settings', ['sample_weeks' => 20])
            ->assertStatus(422)->assertJsonValidationErrors('sample_weeks');

        $saved = $this->putJson('/api/production-plan/settings', [
            'slots' => [
                ['label' => 'Night', 'from' => 21, 'to' => 7],
                ['label' => 'Day', 'from' => 7, 'to' => 21],
            ],
            'lookback_weeks' => 10,
            'sample_weeks' => 6,
            'default_service_level_pct' => 90,
        ])->assertOk()->json('settings');

        $this->assertSame(10, $saved['lookback_weeks']);
        $this->assertSame(90, $saved['default_service_level_pct']);
        $this->assertSame(['Day', 'Night'], array_column($saved['slots'], 'label'));

        // The plan now speaks in those slots.
        $plan = $this->getJson('/api/production-plan')->assertOk()->json();
        $this->assertSame(['7', '21'], array_column($plan['slots'], 'key'));
    }

    public function test_item_dials_are_validated(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $item = Item::factory()->create();

        $this->putJson("/api/production-plan/items/{$item->id}", ['service_level_pct' => 100])
            ->assertStatus(422)->assertJsonValidationErrors('service_level_pct');
        $this->putJson("/api/production-plan/items/{$item->id}", ['round_to' => 0])
            ->assertStatus(422)->assertJsonValidationErrors('round_to');
        $this->putJson('/api/production-plan/items/999999', ['round_to' => 5])->assertNotFound();
        // A size that is not this item's.
        $this->putJson("/api/production-plan/items/{$item->id}", ['variant_id' => 424242, 'round_to' => 5])->assertNotFound();

        $saved = $this->putJson("/api/production-plan/items/{$item->id}", [
            'round_to' => 10, 'min_qty' => 20, 'notes' => 'Trays of ten',
        ])->assertOk()->json('item');
        $this->assertSame(10, $saved['round_to']);
        $this->assertSame(20, $saved['min_qty']);
        $this->assertSame(85, $saved['service_level_pct']);
        $this->assertTrue($saved['enabled']);
    }

    // ── Saving a plan and marking it ───────────────────────────────────

    public function test_a_saved_plan_is_marked_against_what_sold(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $bajiya = Item::factory()->create(['name' => 'Bajiya']);
        $yesterday = '2026-09-07';
        $this->sell($bajiya, "{$yesterday} 19:00", 40);

        $this->postJson('/api/production-plan/commit', [
            'date' => $yesterday,
            'lines' => [[
                'item_id' => $bajiya->id, 'variant_id' => 0,
                'slot_start' => 18, 'slot_end' => 22, 'slot_label' => 'Evening',
                'forecast_qty' => 45, 'planned_qty' => 50,
            ]],
        ])->assertOk()->assertJsonPath('saved', 1);

        // Saving again for the same slot replaces, not duplicates.
        $this->postJson('/api/production-plan/commit', [
            'date' => $yesterday,
            'lines' => [[
                'item_id' => $bajiya->id, 'slot_start' => 18, 'slot_end' => 22, 'slot_label' => 'Evening',
                'forecast_qty' => 45, 'planned_qty' => 50,
            ]],
        ])->assertOk();
        $this->assertSame(1, ProductionPlanRecord::count());

        $accuracy = $this->getJson('/api/production-plan/accuracy?weeks=2')->assertOk()->json();

        $this->assertSame(1, $accuracy['days']);
        $item = $accuracy['items'][0];
        $this->assertSame('Bajiya', $item['name']);
        $this->assertEqualsWithDelta(45.0, $item['forecast'], 0.01);
        $this->assertEqualsWithDelta(50.0, $item['planned'], 0.01);
        $this->assertEqualsWithDelta(40.0, $item['actual'], 0.01);
        $this->assertEqualsWithDelta(10.0, $item['over'], 0.01);
        $this->assertEqualsWithDelta(0.0, $item['short'], 0.01);
        $this->assertSame(100, $item['enough_pct']);
        $this->assertEqualsWithDelta(12.5, $item['bias_pct'], 0.01);
        $this->assertSame('Evening', $accuracy['records'][0]['slot_label']);

        // The actual is written back onto the record.
        $record = ProductionPlanRecord::firstOrFail();
        $this->assertEqualsWithDelta(40.0, $record->actual_qty, 0.01);
        $this->assertFalse($record->sold_out);

        // And the plan for that day shows what was saved.
        $plan = $this->getJson('/api/production-plan?date=' . $yesterday)->assertOk()->json();
        $row = collect($plan['items'])->firstWhere('item_id', $bajiya->id);
        $this->assertEqualsWithDelta(50.0, $row['slots']['18']['saved_planned'], 0.01);
        $this->assertEqualsWithDelta(50.0, $row['day']['saved_planned'], 0.01);
    }

    public function test_commit_validation(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->postJson('/api/production-plan/commit', ['date' => '2026-09-11', 'lines' => []])
            ->assertStatus(422)->assertJsonValidationErrors('lines');
        $this->postJson('/api/production-plan/commit', [
            'date' => '2026-09-11',
            'lines' => [['item_id' => 999999, 'slot_start' => 18, 'slot_end' => 22, 'forecast_qty' => 1, 'planned_qty' => 1]],
        ])->assertStatus(422)->assertJsonValidationErrors('lines.0.item_id');
    }

    // ── Customers ──────────────────────────────────────────────────────

    public function test_customer_habits_are_shares_and_counts_only(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $bajiya = Item::factory()->create(['name' => 'Bajiya']);
        $tea = Item::factory()->create(['name' => 'Tea']);
        $regular = Customer::factory()->create(['name' => 'Ibrahim']);
        $once = Customer::factory()->create(['name' => 'Fathimath']);

        foreach (['2026-09-04', '2026-08-28', '2026-08-21'] as $friday) {
            $this->sell($bajiya, "{$friday} 19:00", 10, $regular);
            $this->sell($bajiya, "{$friday} 19:10", 30);
        }
        $this->sell($tea, '2026-09-04 08:00', 5, $once);
        $this->sell($tea, '2026-09-03 08:00', 5);

        $habits = $this->getJson('/api/production-plan/customers?weeks=8')->assertOk()->json();

        $this->assertSame(8, $habits['orders']['total']);
        $this->assertSame(4, $habits['orders']['registered']);
        $this->assertSame(50, $habits['orders']['registered_share_pct']);
        $this->assertSame(2, $habits['buyers']['registered']);
        $this->assertSame(1, $habits['buyers']['repeat']);
        $this->assertSame(50, $habits['buyers']['repeat_share_pct']);
        // Registered: three bajiya orders of MVR 50 and one tea of MVR 25.
        $this->assertEqualsWithDelta(43.75, $habits['average_ticket']['registered'], 0.01);
        // Walk-in: three of MVR 150 and one of MVR 25.
        $this->assertEqualsWithDelta(118.75, $habits['average_ticket']['walk_in'], 0.01);

        $friday = collect($habits['by_weekday'])->firstWhere('weekday', 'Friday');
        $this->assertSame(7, $friday['orders']);
        $evening = collect($habits['by_slot'])->firstWhere('label', 'Evening');
        $this->assertSame(50, $evening['registered_share_pct']);

        $top = collect($habits['top_items'])->firstWhere('name', 'Bajiya');
        $this->assertSame(25, $top['registered_share_pct']);
        $this->assertSame(1, $top['buyers']);
        $this->assertSame(1, $top['regulars']);

        foreach (['Ibrahim', 'Fathimath'] as $name) {
            $this->assertStringNotContainsString($name, json_encode($habits));
        }
    }

    // ── The snooze now leaves a trace ──────────────────────────────────

    public function test_snoozing_an_item_is_on_the_record_for_the_plan(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $item = Item::factory()->create();

        $this->patchJson("/api/items/{$item->id}/snooze", ['until' => 'end_of_day'])->assertOk();
        $this->assertDatabaseHas('audit_logs', ['action' => 'item.snoozed', 'model_type' => 'Item', 'model_id' => $item->id]);
        $log = \App\Models\AuditLog::where('action', 'item.snoozed')->firstOrFail();
        $this->assertNotEmpty($log->new_values['snoozed_until']);

        $this->patchJson("/api/items/{$item->id}/snooze", ['until' => null])->assertOk();
        $this->assertDatabaseHas('audit_logs', ['action' => 'item.restored', 'model_id' => $item->id]);
    }
}
