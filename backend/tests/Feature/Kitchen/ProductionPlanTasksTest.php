<?php

declare(strict_types=1);

namespace Tests\Feature\Kitchen;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\KitchenProductionBatch;
use App\Models\KitchenProductionItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\ProductionPlanRecord;
use App\Models\Role;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Helpers\ModelHelpers;
use Tests\TestCase;

/**
 * Owner, 2026-09-17: "admin/manager assign and requests items that should
 * be made for tomorrow and assign time and staff to do that, so when he
 * prepares and cashier receives the amount it will be in the prepared list
 * and will be added to the stock."
 *
 * The plan line is the task. The manager saves who and by when; the cook
 * sends what they made from the KDS, which is a prepared-stock batch tied
 * to the line; the counter receives it as it receives any batch, and the
 * line ends up knowing planned, made and received.
 */
class ProductionPlanTasksTest extends TestCase
{
    use ModelHelpers;
    use RefreshDatabase;

    private const NOW = '2026-09-07 15:00:00';

    private const DAY = '2026-09-07';

    private User $owner;

    private User $cook;

    private User $cashier;

    private Item $bajiya;

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['owner' => 'Owner', 'manager' => 'Manager', 'staff' => 'Staff', 'kitchen_staff' => 'Kitchen Staff'] as $slug => $name) {
            Role::firstOrCreate(['slug' => $slug], ['name' => $name, 'is_active' => true]);
        }
        PermissionCatalogSync::sync();
        Carbon::setTestNow(Carbon::parse(self::NOW, config('app.timezone')));

        $this->owner = $this->makeOwner(['name' => 'Owner']);
        $this->cook = $this->makeKitchenStaff(['name' => 'Aishath']);
        $this->cashier = $this->makeStaff('staff', ['name' => 'Cashier']);
        // Prepared stock: the counter's receipt lands on stock_quantity.
        $this->bajiya = Item::factory()->prepared(0)->create(['name' => 'Bajiya']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** @param array<string, mixed> $extra */
    private function commit(array $extra = []): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson('/api/production-plan/commit', [
            'date' => self::DAY,
            'lines' => [[
                'item_id' => $this->bajiya->id, 'variant_id' => 0,
                'slot_start' => 18, 'slot_end' => 22, 'slot_label' => 'Evening',
                'forecast_qty' => 45, 'planned_qty' => 50,
            ] + $extra],
        ])->assertOk()->assertJsonPath('saved', 1);
    }

    private function record(): ProductionPlanRecord
    {
        return ProductionPlanRecord::query()->firstOrFail();
    }

    /** @return array<string, mixed> */
    private function firstTask(): array
    {
        return $this->getJson('/api/production-plan/tasks?date=' . self::DAY)->assertOk()->json('tasks.0');
    }

    public function test_the_plan_carries_who_makes_it_and_by_when(): void
    {
        $this->commit(['assigned_to' => $this->cook->id, 'due_time' => '17:30']);

        $plan = $this->getJson('/api/production-plan?date=' . self::DAY)->assertOk()->json();
        $slot = collect($plan['items'])->firstWhere('item_id', $this->bajiya->id)['slots']['18'];
        $this->assertSame($this->cook->id, $slot['assigned_to']);
        $this->assertSame('Aishath', $slot['assigned_name']);
        $this->assertSame('17:30', $slot['due_time']);
        $this->assertEqualsWithDelta(0.0, $slot['made'], 0.01);
        $this->assertEqualsWithDelta(0.0, $slot['received'], 0.01);

        // Who can be given a task: the cook is on the list, by name.
        $names = collect($plan['assignees'])->pluck('name', 'id');
        $this->assertSame('Aishath', $names->get($this->cook->id));
        $this->assertSame('Owner', $names->get($this->owner->id));

        $task = $this->firstTask();
        $this->assertSame('todo', $task['status']);
        $this->assertSame('Bajiya', $task['name']);
        $this->assertSame('Evening', $task['slot_label']);
        $this->assertEqualsWithDelta(50.0, $task['planned_qty'], 0.01);
        $this->assertEqualsWithDelta(50.0, $task['remaining'], 0.01);
        $this->assertSame('Aishath', $task['assigned_name']);
        $this->assertSame('17:30', $task['due_time']);

        // Saving the plan again without saying who keeps who it was.
        $this->commit();
        $this->assertSame($this->cook->id, $this->record()->assigned_to);
        $this->assertSame('17:30', $this->record()->due_time);

        // Saying nobody clears it.
        $this->commit(['assigned_to' => null, 'due_time' => null]);
        $this->assertNull($this->record()->assigned_to);
        $this->assertNull($this->record()->due_time);
    }

    public function test_the_cook_sends_what_they_made_and_the_counter_receives_it_into_stock(): void
    {
        $this->commit(['assigned_to' => $this->cook->id, 'due_time' => '17:30']);
        $record = $this->record();

        Sanctum::actingAs($this->cook, ['staff']);
        $first = $this->postJson("/api/production-plan/tasks/{$record->id}/made", ['qty' => 30])
            ->assertCreated()
            ->assertJsonPath('task.status', 'partial')
            ->assertJsonPath('task.made_qty', 30)
            ->assertJsonPath('task.remaining', 20)
            ->assertJsonPath('batch.production_type', 'prepared_stock')
            ->assertJsonPath('batch.status', 'submitted')
            ->assertJsonPath('batch.items.0.item_id', $this->bajiya->id)
            ->assertJsonPath('batch.items.0.produced_qty', 30)
            ->json('batch');

        // The batch line remembers the plan line it was made for.
        $prodItem = KitchenProductionItem::query()->firstOrFail();
        $this->assertSame($record->id, $prodItem->production_plan_record_id);
        $this->assertSame($this->cook->id, KitchenProductionBatch::findOrFail($first['id'])->produced_by);
        $record->refresh();
        $this->assertEqualsWithDelta(30.0, $record->made_qty, 0.01);
        $this->assertSame($this->cook->id, $record->made_by);
        $this->assertNotNull($record->made_at);

        $second = $this->postJson("/api/production-plan/tasks/{$record->id}/made", ['qty' => 20])
            ->assertCreated()
            ->assertJsonPath('task.status', 'made')
            ->assertJsonPath('task.remaining', 0)
            ->json('batch');
        $this->assertSame('made', $this->firstTask()['status']);

        // The counter takes the first batch in: stock goes up, the line knows.
        Sanctum::actingAs($this->cashier, ['staff']);
        $this->postJson("/api/kitchen-receiving/{$first['id']}/receive-all")
            ->assertOk()
            ->assertJsonPath('batch.status', 'received');
        $this->assertEqualsWithDelta(30.0, $this->record()->received_qty, 0.01);
        $this->assertSame(30, (int) $this->bajiya->fresh()->stock_quantity);
        Sanctum::actingAs($this->cook, ['staff']);
        $this->assertSame('made', $this->firstTask()['status']);

        Sanctum::actingAs($this->cashier, ['staff']);
        $this->postJson("/api/kitchen-receiving/{$second['id']}/receive-all")->assertOk();
        $this->assertEqualsWithDelta(50.0, $this->record()->received_qty, 0.01);
        $this->assertSame(50, (int) $this->bajiya->fresh()->stock_quantity);
        Sanctum::actingAs($this->cook, ['staff']);
        $task = $this->firstTask();
        $this->assertSame('received', $task['status']);
        $this->assertEqualsWithDelta(50.0, $task['received_qty'], 0.01);
    }

    public function test_how_it_did_shows_planned_made_received_and_the_cook(): void
    {
        $this->commit(['assigned_to' => $this->cook->id, 'due_time' => '17:30']);
        $record = $this->record();

        // Made at four, for half past five: on time.
        Carbon::setTestNow(Carbon::parse(self::DAY . ' 16:00:00', config('app.timezone')));
        Sanctum::actingAs($this->cook, ['staff']);
        $batch = $this->postJson("/api/production-plan/tasks/{$record->id}/made", ['qty' => 50])->assertCreated()->json('batch');
        Sanctum::actingAs($this->cashier, ['staff']);
        $this->postJson("/api/kitchen-receiving/{$batch['id']}/receive-all")->assertOk();

        // Forty sold that evening; the next morning the manager looks back.
        $this->sell(self::DAY . ' 19:00', 40);
        Carbon::setTestNow(Carbon::parse('2026-09-08 10:00:00', config('app.timezone')));
        Sanctum::actingAs($this->owner, ['staff']);

        $accuracy = $this->getJson('/api/production-plan/accuracy?weeks=2')->assertOk()->json();
        $this->assertEqualsWithDelta(50.0, $accuracy['totals']['planned'], 0.01);
        $this->assertEqualsWithDelta(50.0, $accuracy['totals']['made'], 0.01);
        $this->assertEqualsWithDelta(50.0, $accuracy['totals']['received'], 0.01);
        $this->assertEqualsWithDelta(40.0, $accuracy['totals']['actual'], 0.01);
        $this->assertEqualsWithDelta(50.0, $accuracy['items'][0]['made'], 0.01);

        $cook = $accuracy['cooks'][0];
        $this->assertSame('Aishath', $cook['name']);
        $this->assertSame(1, $cook['n']);
        $this->assertEqualsWithDelta(50.0, $cook['planned'], 0.01);
        $this->assertEqualsWithDelta(50.0, $cook['made'], 0.01);
        $this->assertEqualsWithDelta(50.0, $cook['received'], 0.01);
        $this->assertSame(1, $cook['on_time']);
        $this->assertSame(0, $cook['late']);
        $this->assertSame(0, $cook['not_made']);
        $this->assertSame(100, $cook['made_pct']);

        $row = $accuracy['records'][0];
        $this->assertSame('Aishath', $row['cook']);
        $this->assertSame('17:30', $row['due_time']);
        $this->assertEqualsWithDelta(50.0, $row['made'], 0.01);
        $this->assertEqualsWithDelta(50.0, $row['received'], 0.01);

        // And the plan for the day shows the counter's figure.
        $plan = $this->getJson('/api/production-plan?date=' . self::DAY)->assertOk()->json();
        $item = collect($plan['items'])->firstWhere('item_id', $this->bajiya->id);
        $this->assertEqualsWithDelta(50.0, $item['slots']['18']['made'], 0.01);
        $this->assertEqualsWithDelta(50.0, $item['slots']['18']['received'], 0.01);
        $this->assertEqualsWithDelta(50.0, $item['day']['received'], 0.01);
    }

    public function test_who_may_and_what_is_checked(): void
    {
        $this->commit(['assigned_to' => $this->cook->id]);
        $record = $this->record();

        // The cook sees the day's jobs; an account with no kitchen rights does not.
        Sanctum::actingAs($this->cook, ['staff']);
        $this->getJson('/api/production-plan/tasks')->assertOk()->assertJsonPath('date', self::DAY);
        $this->postJson("/api/production-plan/tasks/{$record->id}/made", [])->assertStatus(422)->assertJsonValidationErrors('qty');
        $this->postJson("/api/production-plan/tasks/{$record->id}/made", ['qty' => 0])->assertStatus(422);

        $nobody = $this->makeStaff('nobody', ['name' => 'Nobody']);
        Sanctum::actingAs($nobody, ['staff']);
        $this->getJson('/api/production-plan/tasks')->assertForbidden();
        $this->postJson("/api/production-plan/tasks/{$record->id}/made", ['qty' => 5])->assertForbidden();

        // Assigning someone who does not exist is refused.
        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson('/api/production-plan/commit', [
            'date' => self::DAY,
            'lines' => [[
                'item_id' => $this->bajiya->id, 'slot_start' => 18, 'slot_end' => 22,
                'forecast_qty' => 45, 'planned_qty' => 50, 'assigned_to' => 999999, 'due_time' => '5pm',
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors(['lines.0.assigned_to', 'lines.0.due_time']);
    }

    private function sell(string $when, int $qty): void
    {
        $at = Carbon::parse($when, config('app.timezone'));
        $order = Order::factory()->create([
            'status' => 'completed',
            'customer_id' => null,
            'subtotal' => $qty * 5, 'tax_amount' => 0, 'total' => $qty * 5,
            'created_at' => $at, 'updated_at' => $at, 'completed_at' => $at,
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'item_id' => $this->bajiya->id, 'item_name' => $this->bajiya->name,
            'quantity' => $qty, 'unit_price' => 5, 'total_price' => $qty * 5,
        ]);
    }
}
