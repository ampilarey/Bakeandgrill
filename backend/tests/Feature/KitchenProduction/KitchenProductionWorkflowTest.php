<?php

declare(strict_types=1);

namespace Tests\Feature\KitchenProduction;

use App\Domains\Kitchen\Support\KitchenHandoverSettings;
use App\Domains\Orders\Events\OrderCompleted;
use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Orders\Events\OrderStatusChanged;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\KitchenProductionBatch;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\SiteSetting;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Helpers\ModelHelpers;
use Tests\TestCase;

class KitchenProductionWorkflowTest extends TestCase
{
    use RefreshDatabase;
    use ModelHelpers;

    private const KDS_DEVICE = 'KITCHEN-KP-01';

    private User $kitchen;

    private User $cashier;

    private User $manager;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();

        $this->kitchen = $this->makeKitchenStaff([
            'email' => 'kitchen@kp.test',
            'pin_hash' => Hash::make('5678'),
        ]);
        $this->cashier = $this->makeStaff('staff', ['email' => 'cashier@kp.test']);
        $this->manager = $this->makeManager(['email' => 'manager@kp.test']);

        Device::create([
            'name' => 'Kitchen KDS',
            'identifier' => self::KDS_DEVICE,
            'type' => 'kds',
            'is_active' => true,
        ]);

        $cat = Category::create(['name' => 'KP Test', 'slug' => 'kp-test', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $cat->id,
            'name' => 'Burger',
            'base_price' => 50.0,
            'sku' => 'KP-BRG-001',
            'is_active' => true,
            'is_available' => true,
            'track_stock' => true,
            'availability_type' => 'stock_based',
            'stock_quantity' => 5,
        ]);
    }

    private function createInProgressOrder(int $qty = 2): Order
    {
        $order = Order::create([
            'order_number' => 'KP-' . uniqid(),
            'type' => 'takeaway',
            'status' => 'in_progress',
            'payment_status' => 'unpaid',
            'subtotal' => 50.0 * $qty,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 50.0 * $qty,
            'total_laar' => 5000 * $qty,
        ]);

        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $this->item->id,
            'item_name' => $this->item->name,
            'quantity' => $qty,
            'unit_price' => 50.0,
            'total_price' => 50.0 * $qty,
        ]);

        return $order->fresh(['items']);
    }

    private function kdsHeaders(): array
    {
        return ['X-Device-Identifier' => self::KDS_DEVICE];
    }

    public function test_kitchen_staff_can_mark_item_cooked_and_submit_batch(): void
    {
        Sanctum::actingAs($this->kitchen, ['staff']);
        $order = $this->createInProgressOrder();
        $line = $order->items->first();

        $this->withHeaders($this->kdsHeaders())
            ->postJson("/api/kds/orders/{$order->id}/items/{$line->id}/cooked")
            ->assertOk()
            ->assertJsonPath('order.items.0.kitchen_produced_qty', 2);

        $this->assertDatabaseHas('kitchen_production_batches', [
            'order_id' => $order->id,
            'production_type' => 'order_bound',
            'status' => 'submitted',
        ]);

        $fresh = $order->fresh();
        $this->assertSame('produced', $fresh->kitchen_handover_status);
    }

    public function test_kitchen_done_sets_timestamps_only_without_status_or_payment_change(): void
    {
        Event::fake([OrderPaid::class, OrderCompleted::class, OrderStatusChanged::class]);
        Sanctum::actingAs($this->kitchen, ['staff']);
        $order = $this->createInProgressOrder();
        $taxBefore = \App\Models\TaxLedgerEntry::count();

        $this->withHeaders($this->kdsHeaders())
            ->postJson("/api/kds/orders/{$order->id}/kitchen-done")
            ->assertOk()
            ->assertJsonPath('order.status', 'in_progress');

        $fresh = $order->fresh();
        $this->assertSame('in_progress', $fresh->status);
        $this->assertSame('unpaid', $fresh->payment_status);
        $this->assertNotNull($fresh->kitchen_done_at);
        $this->assertSame($taxBefore, \App\Models\TaxLedgerEntry::count());

        Event::assertNotDispatched(OrderPaid::class);
        Event::assertNotDispatched(OrderCompleted::class);
        Event::assertNotDispatched(OrderStatusChanged::class);
    }

    public function test_cashier_sees_pending_receive_and_can_receive_all(): void
    {
        Sanctum::actingAs($this->kitchen, ['staff']);
        $order = $this->createInProgressOrder();
        $line = $order->items->first();

        $this->withHeaders($this->kdsHeaders())
            ->postJson("/api/kds/orders/{$order->id}/items/{$line->id}/cooked")
            ->assertOk();

        $batchId = KitchenProductionBatch::where('order_id', $order->id)->value('id');

        Sanctum::actingAs($this->cashier, ['staff']);

        $this->getJson('/api/kitchen-receiving/pending')
            ->assertOk()
            ->assertJsonPath('data.0.id', $batchId);

        $this->postJson("/api/kitchen-receiving/{$batchId}/receive-all")
            ->assertOk()
            ->assertJsonPath('batch.status', 'received');

        $fresh = $order->fresh();
        $this->assertNotNull($fresh->pos_received_at);
        $this->assertSame('received', $fresh->kitchen_handover_status);
    }

    public function test_mark_ready_blocked_until_received_when_setting_enabled(): void
    {
        Sanctum::actingAs($this->kitchen, ['staff']);
        $order = $this->createInProgressOrder();

        $this->withHeaders($this->kdsHeaders())
            ->postJson("/api/kds/orders/{$order->id}/kitchen-done")
            ->assertOk();

        Sanctum::actingAs($this->cashier, ['staff']);

        $this->postJson("/api/orders/{$order->id}/mark-ready")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Receive from kitchen before marking ready.');

        $batchId = KitchenProductionBatch::where('order_id', $order->id)->value('id');
        $this->postJson("/api/kitchen-receiving/{$batchId}/receive-all")->assertOk();

        Event::fake([OrderStatusChanged::class]);

        $this->postJson("/api/orders/{$order->id}/mark-ready")
            ->assertOk()
            ->assertJsonPath('order.status', 'ready');
    }

    public function test_mark_ready_allowed_without_receive_when_setting_disabled(): void
    {
        SiteSetting::set('kitchen_require_pos_receiving_before_ready', 'false');
        SiteSetting::bust();

        Sanctum::actingAs($this->kitchen, ['staff']);
        $order = $this->createInProgressOrder();

        $this->withHeaders($this->kdsHeaders())
            ->postJson("/api/kds/orders/{$order->id}/kitchen-done")
            ->assertOk();

        Sanctum::actingAs($this->cashier, ['staff']);

        $this->postJson("/api/orders/{$order->id}/mark-ready")
            ->assertOk()
            ->assertJsonPath('order.status', 'ready');
    }

    public function test_kitchen_staff_cannot_receive_without_permission(): void
    {
        Sanctum::actingAs($this->kitchen, ['staff']);
        $order = $this->createInProgressOrder();
        $line = $order->items->first();

        $this->withHeaders($this->kdsHeaders())
            ->postJson("/api/kds/orders/{$order->id}/items/{$line->id}/cooked")
            ->assertOk();

        $batchId = KitchenProductionBatch::where('order_id', $order->id)->value('id');

        $this->getJson('/api/kitchen-receiving/pending')->assertForbidden();
        $this->postJson("/api/kitchen-receiving/{$batchId}/receive-all")->assertForbidden();
    }

    public function test_cashier_cannot_create_production_batch(): void
    {
        Sanctum::actingAs($this->cashier, ['staff']);

        $this->postJson('/api/kitchen-production', [
            'production_type' => 'prepared_stock',
            'source' => 'pos',
            'items' => [[
                'item_id' => $this->item->id,
                'produced_qty' => 10,
                'unit' => 'pcs',
            ]],
        ])->assertForbidden();
    }

    public function test_prepared_stock_receive_is_idempotent(): void
    {
        $preparedItem = Item::create([
            'category_id' => $this->item->category_id,
            'name' => 'Prepared Roll',
            'base_price' => 15.0,
            'sku' => 'KP-PREP-001',
            'is_active' => true,
            'is_available' => true,
            'track_stock' => true,
            'availability_type' => 'stock_based',
            'stock_quantity' => 3,
        ]);

        Sanctum::actingAs($this->kitchen, ['staff']);

        $create = $this->postJson('/api/kitchen-production', [
            'production_type' => 'prepared_stock',
            'source' => 'kds',
            'items' => [[
                'item_id' => $preparedItem->id,
                'produced_qty' => 5,
                'unit' => 'pcs',
            ]],
        ])->assertCreated();

        $batchId = $create->json('batch.id');
        $this->postJson("/api/kitchen-production/{$batchId}/submit")->assertOk();

        Sanctum::actingAs($this->cashier, ['staff']);
        $stockBefore = (int) $preparedItem->fresh()->stock_quantity;

        $this->postJson("/api/kitchen-receiving/{$batchId}/receive-all")->assertOk();
        $afterFirst = (int) $preparedItem->fresh()->stock_quantity;
        $this->assertSame($stockBefore + 5, $afterFirst);

        $movements = StockMovement::where('idempotency_key', 'like', 'kitchen:receive:%')->count();
        $this->assertSame(1, $movements);

        // Receiving again should not double stock (batch already received)
        $this->postJson("/api/kitchen-receiving/{$batchId}/receive-all")->assertOk();
        $this->assertSame($afterFirst, (int) $preparedItem->fresh()->stock_quantity);
        $this->assertSame(1, StockMovement::where('idempotency_key', 'like', 'kitchen:receive:%')->count());
    }

    public function test_manager_can_review_variance(): void
    {
        Sanctum::actingAs($this->kitchen, ['staff']);
        $order = $this->createInProgressOrder();
        $line = $order->items->first();

        $this->withHeaders($this->kdsHeaders())
            ->postJson("/api/kds/orders/{$order->id}/items/{$line->id}/cooked", ['qty' => 1])
            ->assertOk();

        $batchId = KitchenProductionBatch::where('order_id', $order->id)->value('id');
        $prodItemId = KitchenProductionBatch::find($batchId)->items()->first()->id;

        Sanctum::actingAs($this->cashier, ['staff']);
        $this->postJson("/api/kitchen-receiving/{$batchId}/items/{$prodItemId}/receive", ['received_qty' => 1])
            ->assertOk();

        Sanctum::actingAs($this->manager, ['staff']);

        $list = $this->getJson('/api/kitchen-variance?reviewed=0')->assertOk();
        $varianceId = $list->json('data.0.id');
        $this->assertNotNull($varianceId);

        $this->postJson("/api/kitchen-variance/{$varianceId}/review", ['notes' => 'Accepted partial'])
            ->assertOk()
            ->assertJsonStructure(['variance' => ['reviewed_at']]);
    }

    public function test_kitchen_handover_settings_helper_reads_seeded_defaults(): void
    {
        $this->assertTrue(KitchenHandoverSettings::requirePosReceivingBeforeReady());
        $this->assertTrue(KitchenHandoverSettings::receiveUpdatesPreparedStock());
        $this->assertFalse(KitchenHandoverSettings::productionConsumesRecipeStock());
    }
}
