<?php

declare(strict_types=1);

namespace Tests\Feature\Trade;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Role;
use App\Models\StockMovement;
use App\Models\TradeAccount;
use App\Models\TradeDelivery;
use App\Models\TradePriceListEntry;
use App\Models\User;
use App\Models\WasteLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class TradeDeliveryDispatchTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $manager;

    private User $cashier;

    private Customer $customer;

    private TradeAccount $account;

    private Item $trackedItem;

    private Item $untrackedItem;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();

        $ownerRole = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        $managerRole = Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'is_active' => true]);
        $staffRole = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);

        $this->owner = User::create([
            'name' => 'Owner', 'email' => 'td-owner@test.local', 'phone' => '7711001',
            'password' => Hash::make('password'), 'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        $this->manager = User::create([
            'name' => 'Manager', 'email' => 'td-mgr@test.local', 'phone' => '7711002',
            'password' => Hash::make('password'), 'role_id' => $managerRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        $this->cashier = User::create([
            'name' => 'Cashier', 'email' => 'td-cash@test.local', 'phone' => '7711003',
            'password' => Hash::make('password'), 'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'name' => 'Island Mart',
            'phone' => '+9607711001',
            'is_active' => true,
            'credit_enabled' => true,
            'credit_status' => 'active',
            'credit_limit_laar' => 500000,
            'credit_balance_laar' => 0,
            'sms_opt_out' => false,
        ]);

        $this->account = TradeAccount::create([
            'customer_id' => $this->customer->id,
            'shop_name' => 'Island Mart',
            'contact_phone' => '+9607711001',
            'default_discount_bp' => 1000,
            'is_active' => true,
        ]);

        $cat = Category::create(['name' => 'Trade', 'slug' => 'trade-del', 'is_active' => true]);
        $this->trackedItem = Item::create([
            'category_id' => $cat->id,
            'name' => 'Momo set',
            'base_price' => 100.00,
            'cost' => 40.00,
            'sku' => 'MOMO-TD',
            'is_active' => true,
            'is_available' => true,
            'track_stock' => true,
            'availability_type' => 'stock_based',
            'stock_quantity' => 50,
            'wholesale_price_laar' => 8000,
        ]);
        $this->untrackedItem = Item::create([
            'category_id' => $cat->id,
            'name' => 'Service fee pack',
            'base_price' => 10.00,
            'cost' => 0,
            'sku' => 'SVC-TD',
            'is_active' => true,
            'is_available' => true,
            'track_stock' => false,
            'availability_type' => 'always',
            'wholesale_price_laar' => 1000,
        ]);
    }

    private function dispatchPayload(array $overrides = []): array
    {
        return array_merge([
            'trade_account_id' => $this->account->id,
            'idempotency_key' => 'test-dispatch-'.uniqid(),
            'lines' => [
                ['item_id' => $this->trackedItem->id, 'qty' => 10],
            ],
        ], $overrides);
    }

    #[Test]
    public function dispatch_creates_no_order_payment_or_tax_ledger(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $ordersBefore = Order::count();
        $paymentsBefore = Payment::count();

        $this->postJson('/api/trade/deliveries/dispatch', $this->dispatchPayload())
            ->assertCreated();

        $this->assertSame($ordersBefore, Order::count());
        $this->assertSame($paymentsBefore, Payment::count());
        if (\Illuminate\Support\Facades\Schema::hasTable('gst_ledger_entries')) {
            $this->assertDatabaseCount('gst_ledger_entries', 0);
        }
    }

    #[Test]
    public function dispatch_deducts_finished_goods_stock_once(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $this->postJson('/api/trade/deliveries/dispatch', $this->dispatchPayload([
            'idempotency_key' => 'stock-once-1',
            'lines' => [['item_id' => $this->trackedItem->id, 'qty' => 10]],
        ]))->assertCreated();

        $this->assertSame(40, (int) $this->trackedItem->fresh()->stock_quantity);
        $this->assertSame(1, StockMovement::where('type', 'consignment_out')->count());
        $this->assertNull(StockMovement::where('type', 'consignment_out')->value('inventory_item_id'));
    }

    #[Test]
    public function non_stock_tracked_item_dispatches_without_deduction(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $this->postJson('/api/trade/deliveries/dispatch', $this->dispatchPayload([
            'idempotency_key' => 'untracked-1',
            'lines' => [['item_id' => $this->untrackedItem->id, 'qty' => 5]],
        ]))->assertCreated();

        $this->assertSame(0, StockMovement::where('type', 'consignment_out')->count());
    }

    #[Test]
    public function dispatch_refused_when_line_has_no_price(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $this->trackedItem->update(['wholesale_price_laar' => null]);
        $this->account->update(['default_discount_bp' => null]);

        $this->postJson('/api/trade/deliveries/dispatch', $this->dispatchPayload([
            'idempotency_key' => 'no-price-1',
        ]))->assertStatus(422)
            ->assertJsonFragment(['message' => 'No wholesale price for "Momo set". Set a shop price, a standard wholesale price, or a default discount before dispatching.']);
    }

    #[Test]
    public function dispatch_refused_when_credit_not_enabled(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $this->customer->update(['credit_enabled' => false]);

        $this->postJson('/api/trade/deliveries/dispatch', $this->dispatchPayload([
            'idempotency_key' => 'no-credit-1',
        ]))->assertStatus(422);
    }

    #[Test]
    public function dispatch_refused_when_exposure_exceeds_limit(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        // 10 × 8000 = 80000; set limit tiny
        $this->customer->update(['credit_limit_laar' => 1000, 'credit_balance_laar' => 0]);

        $this->postJson('/api/trade/deliveries/dispatch', $this->dispatchPayload([
            'idempotency_key' => 'over-limit-1',
        ]))->assertStatus(422);
    }

    #[Test]
    public function owner_override_allows_over_limit_with_reason(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $this->customer->update(['credit_limit_laar' => 1000, 'credit_balance_laar' => 0]);

        $res = $this->postJson('/api/trade/deliveries/dispatch', $this->dispatchPayload([
            'idempotency_key' => 'override-1',
            'credit_override_reason' => 'Trusted shop — temporary increase',
        ]))->assertCreated();

        $this->assertSame('Trusted shop — temporary increase', $res->json('delivery.credit_override_reason')
            ?? TradeDelivery::find($res->json('delivery.id'))->credit_override_reason);
    }

    #[Test]
    public function exposure_counts_unbilled_dispatched_goods(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $this->customer->update(['credit_balance_laar' => 5000, 'credit_limit_laar' => 1_000_000]);

        $this->postJson('/api/trade/deliveries/dispatch', $this->dispatchPayload([
            'idempotency_key' => 'exposure-1',
            'lines' => [['item_id' => $this->trackedItem->id, 'qty' => 10]], // 80000
        ]))->assertCreated();

        $res = $this->getJson("/api/admin/trade-accounts/{$this->account->id}/exposure")->assertOk();
        $this->assertSame(5000, $res->json('exposure.balance_owed_laar'));
        $this->assertSame(80000, $res->json('exposure.holding_unbilled_laar'));
        $this->assertSame(85000, $res->json('exposure.exposure_laar'));
    }

    #[Test]
    public function dispatched_delivery_cannot_be_edited_cancel_returns_stock_once(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $res = $this->postJson('/api/trade/deliveries/dispatch', $this->dispatchPayload([
            'idempotency_key' => 'cancel-1',
            'lines' => [['item_id' => $this->trackedItem->id, 'qty' => 10]],
        ]))->assertCreated();

        $id = $res->json('delivery.id');
        $this->assertSame(40, (int) $this->trackedItem->fresh()->stock_quantity);

        // No update endpoint — cancel restores stock
        $this->postJson("/api/trade/deliveries/{$id}/cancel")->assertOk()
            ->assertJsonPath('delivery.status', 'cancelled');

        $this->assertSame(50, (int) $this->trackedItem->fresh()->stock_quantity);
        $this->assertSame(1, StockMovement::where('type', 'consignment_in')->count());

        // Second cancel refused
        $this->postJson("/api/trade/deliveries/{$id}/cancel")->assertStatus(422);
        $this->assertSame(1, StockMovement::where('type', 'consignment_in')->count());
    }

    #[Test]
    public function retry_same_idempotency_key_creates_one_delivery_and_one_movement(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $payload = $this->dispatchPayload([
            'idempotency_key' => 'idem-same-key',
            'lines' => [['item_id' => $this->trackedItem->id, 'qty' => 5]],
        ]);

        $a = $this->postJson('/api/trade/deliveries/dispatch', $payload)->assertCreated();
        $b = $this->postJson('/api/trade/deliveries/dispatch', $payload)->assertSuccessful();

        $this->assertSame($a->json('delivery.id'), $b->json('delivery.id'));
        $this->assertSame(1, TradeDelivery::count());
        $this->assertSame(1, StockMovement::where('type', 'consignment_out')->count());
        $this->assertSame(45, (int) $this->trackedItem->fresh()->stock_quantity);
    }

    #[Test]
    public function manager_and_cashier_lack_dispatch_and_reconcile_by_default(): void
    {
        $perms = app(\App\Services\PermissionService::class);
        foreach ([$this->manager, $this->cashier] as $user) {
            $this->assertFalse($perms->hasPermission($user, 'trade.dispatch'));
            $this->assertFalse($perms->hasPermission($user, 'trade.reconcile'));
        }

        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson('/api/trade/deliveries/dispatch', $this->dispatchPayload())->assertForbidden();

        Sanctum::actingAs($this->cashier, ['staff']);
        $this->postJson('/api/trade/deliveries/dispatch', $this->dispatchPayload())->assertForbidden();
    }

    #[Test]
    public function unbalanced_reconciliation_is_rejected(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $res = $this->postJson('/api/trade/deliveries/dispatch', $this->dispatchPayload([
            'idempotency_key' => 'unbal-1',
            'lines' => [['item_id' => $this->trackedItem->id, 'qty' => 10]],
        ]))->assertCreated();

        $deliveryId = $res->json('delivery.id');
        $lineId = $res->json('delivery.lines.0.id');

        // counted return 5 + missing 6 = 11 > sent 10 → cannot balance
        $this->postJson("/api/trade/deliveries/{$deliveryId}/reconcile", [
            'lines' => [[
                'line_id' => $lineId,
                'reported_sold_qty' => 3,
                'counted_return_qty' => 5,
                'qty_missing' => 6,
                'return_action' => 'accept_to_stock',
                'return_idempotency_key' => 'ret-unbal-1',
            ]],
        ])->assertStatus(422);
    }

    #[Test]
    public function marking_sold_causes_no_second_stock_deduction(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $res = $this->postJson('/api/trade/deliveries/dispatch', $this->dispatchPayload([
            'idempotency_key' => 'sold-once-1',
            'lines' => [['item_id' => $this->trackedItem->id, 'qty' => 10]],
        ]))->assertCreated();

        $stockAfterDispatch = (int) $this->trackedItem->fresh()->stock_quantity;
        $outCount = StockMovement::where('type', 'consignment_out')->count();

        $deliveryId = $res->json('delivery.id');
        $lineId = $res->json('delivery.lines.0.id');

        $this->postJson("/api/trade/deliveries/{$deliveryId}/reconcile", [
            'lines' => [[
                'line_id' => $lineId,
                'reported_sold_qty' => 10,
                'counted_return_qty' => 0,
                'qty_missing' => 0,
                'return_idempotency_key' => 'ret-sold-1',
            ]],
        ])->assertOk();

        $this->assertSame($stockAfterDispatch, (int) $this->trackedItem->fresh()->stock_quantity);
        $this->assertSame($outCount, StockMovement::where('type', 'consignment_out')->count());
        $this->assertSame(0, StockMovement::where('type', 'sale')->where('reference_type', 'trade_delivery')->count());
    }

    #[Test]
    public function accepted_returns_reenter_stock_rejected_create_waste_log(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $res = $this->postJson('/api/trade/deliveries/dispatch', $this->dispatchPayload([
            'idempotency_key' => 'return-1',
            'lines' => [['item_id' => $this->trackedItem->id, 'qty' => 10]],
        ]))->assertCreated();

        $deliveryId = $res->json('delivery.id');
        $lineId = $res->json('delivery.lines.0.id');

        // Accept 3 back
        $this->postJson("/api/trade/deliveries/{$deliveryId}/reconcile", [
            'lines' => [[
                'line_id' => $lineId,
                'reported_sold_qty' => 7,
                'counted_return_qty' => 3,
                'qty_missing' => 0,
                'return_action' => 'accept_to_stock',
                'return_condition' => 'good',
                'return_idempotency_key' => 'ret-accept-1',
            ]],
        ])->assertOk();

        $this->assertSame(43, (int) $this->trackedItem->fresh()->stock_quantity); // 40 + 3
        $this->assertSame(0, WasteLog::count());

        // Fresh delivery for waste path
        $res2 = $this->postJson('/api/trade/deliveries/dispatch', $this->dispatchPayload([
            'idempotency_key' => 'return-waste-1',
            'lines' => [['item_id' => $this->trackedItem->id, 'qty' => 4]],
        ]))->assertCreated();
        $d2 = $res2->json('delivery.id');
        $l2 = $res2->json('delivery.lines.0.id');
        $stockBefore = (int) $this->trackedItem->fresh()->stock_quantity;

        $this->postJson("/api/trade/deliveries/{$d2}/reconcile", [
            'lines' => [[
                'line_id' => $l2,
                'reported_sold_qty' => 2,
                'counted_return_qty' => 2,
                'qty_missing' => 0,
                'return_action' => 'reject_to_waste',
                'return_condition' => 'damaged',
                'return_idempotency_key' => 'ret-waste-1',
            ]],
        ])->assertOk();

        $this->assertSame($stockBefore, (int) $this->trackedItem->fresh()->stock_quantity);
        $waste = WasteLog::first();
        $this->assertNotNull($waste);
        $this->assertSame(2.0, (float) $waste->quantity);
        // unit_cost 40.00 MVR × 2 = 80.00
        $this->assertEqualsWithDelta(80.0, (float) $waste->cost_estimate, 0.01);
    }

    #[Test]
    public function mismatch_flag_when_reported_disagrees_with_count(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $res = $this->postJson('/api/trade/deliveries/dispatch', $this->dispatchPayload([
            'idempotency_key' => 'mismatch-1',
            'lines' => [['item_id' => $this->trackedItem->id, 'qty' => 10]],
        ]))->assertCreated();

        $deliveryId = $res->json('delivery.id');
        $lineId = $res->json('delivery.lines.0.id');

        // Shop said sold 8, but counted return 1 → implied sold 9
        $out = $this->postJson("/api/trade/deliveries/{$deliveryId}/reconcile", [
            'lines' => [[
                'line_id' => $lineId,
                'reported_sold_qty' => 8,
                'counted_return_qty' => 1,
                'qty_missing' => 1,
                'return_action' => 'accept_to_stock',
                'return_condition' => 'good',
                'return_idempotency_key' => 'ret-mismatch-1',
            ]],
        ])->assertOk();

        $this->assertTrue($out->json('delivery.has_mismatch'));
    }

    #[Test]
    public function self_reconcile_is_allowed_but_flagged(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $res = $this->postJson('/api/trade/deliveries/dispatch', $this->dispatchPayload([
            'idempotency_key' => 'self-rec-1',
            'lines' => [['item_id' => $this->trackedItem->id, 'qty' => 5]],
        ]))->assertCreated();

        $deliveryId = $res->json('delivery.id');
        $lineId = $res->json('delivery.lines.0.id');

        $out = $this->postJson("/api/trade/deliveries/{$deliveryId}/reconcile", [
            'lines' => [[
                'line_id' => $lineId,
                'reported_sold_qty' => 5,
                'counted_return_qty' => 0,
                'qty_missing' => 0,
                'return_idempotency_key' => 'ret-self-1',
            ]],
        ])->assertOk();

        $this->assertTrue($out->json('delivery.self_reconciled'));
    }

    #[Test]
    public function dispatch_sms_respects_opt_out_and_contains_no_money_owed(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $this->customer->update(['sms_opt_out' => true]);

        $this->postJson('/api/trade/deliveries/dispatch', $this->dispatchPayload([
            'idempotency_key' => 'sms-opt-1',
        ]))->assertCreated();

        $this->assertDatabaseMissing('sms_logs', [
            'idempotency_key' => 'trade:dispatch:sms:'.TradeDelivery::first()->id,
        ]);
    }

    #[Test]
    public function stamped_price_does_not_change_when_price_list_updates(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        TradePriceListEntry::create([
            'trade_account_id' => $this->account->id,
            'item_id' => $this->trackedItem->id,
            'variant_id' => null,
            'price_laar' => 5500,
            'is_active' => true,
        ]);

        $res = $this->postJson('/api/trade/deliveries/dispatch', $this->dispatchPayload([
            'idempotency_key' => 'stamp-1',
            'lines' => [['item_id' => $this->trackedItem->id, 'qty' => 2]],
        ]))->assertCreated();

        $this->assertSame(5500, $res->json('delivery.lines.0.unit_price_laar'));

        TradePriceListEntry::where('trade_account_id', $this->account->id)->update(['price_laar' => 100]);

        $show = $this->getJson('/api/trade/deliveries/'.$res->json('delivery.id'))->assertOk();
        $this->assertSame(5500, $show->json('delivery.lines.0.unit_price_laar'));
    }
}
