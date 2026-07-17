<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Models\InventoryItem;
use App\Models\InventoryReorderAlert;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\SupplierPriceHistory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RestockIntelligenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_restock_plan_includes_buy_frequency_and_usage(): void
    {
        $owner = $this->makeOwner();

        $supplier = Supplier::create(['name' => 'Mill Co', 'is_active' => true]);
        $flour = InventoryItem::create([
            'name' => 'Flour',
            'sku' => 'FLR-RST',
            'unit' => 'kg',
            'current_stock' => 10,
            'reorder_point' => 20,
            'reorder_quantity' => 40,
            'unit_cost' => 5,
            'last_purchase_price' => 4,
            'preferred_supplier_id' => $supplier->id,
            'is_active' => true,
        ]);

        $deduct = StockMovement::create([
            'idempotency_key' => 'test-deduct-flour-1',
            'inventory_item_id' => $flour->id,
            'user_id' => $owner->id,
            'type' => 'deduction',
            'quantity' => -30,
            'balance_after' => 10,
            'unit_cost' => 5,
            'reference_type' => 'order',
            'reference_id' => 1,
            'notes' => 'test',
        ]);
        $deduct->forceFill([
            'created_at' => now()->subDays(10),
            'updated_at' => now()->subDays(10),
        ])->save();

        $d1 = now()->subDays(28)->toDateString();
        $d2 = now()->subDays(14)->toDateString();
        foreach ([$d1, $d2] as $i => $date) {
            $po = Purchase::create([
                'purchase_number' => 'PO-RST-'.$i,
                'supplier_id' => $supplier->id,
                'user_id' => $owner->id,
                'status' => 'received',
                'subtotal' => 100,
                'tax_amount' => 0,
                'total' => 100,
                'purchase_date' => $date,
                'actual_delivery_date' => $date,
            ]);
            PurchaseItem::create([
                'purchase_id' => $po->id,
                'inventory_item_id' => $flour->id,
                'quantity' => 25,
                'received_quantity' => 25,
                'receive_status' => 'complete',
                'unit_cost' => 4,
                'total_cost' => 100,
            ]);
        }

        $response = $this->getJson(
            '/api/forecasts/restock?lookback_days=30&buy_lookback_days=90&lead_days=3&cover_days=14',
            $this->staffHeaders($owner),
        );

        $response->assertOk()
            ->assertJsonPath('totals.below_rop', 1)
            ->assertJsonPath('items.0.name', 'Flour')
            ->assertJsonPath('items.0.buy_frequency.purchase_count', 2)
            ->assertJsonPath('items.0.buy_frequency.avg_days_between', 14)
            ->assertJsonPath('items.0.status', 'critical');

        $this->assertGreaterThan(0, (float) $response->json('items.0.daily_usage_rate'));
        $this->assertNotNull($response->json('items.0.suggested_next_order_date'));
        $this->assertGreaterThan(0, (float) $response->json('items.0.suggested_order_qty'));
        $this->assertSame($supplier->id, (int) $response->json('items.0.suggested_supplier.id'));
        $this->assertSame('preferred', $response->json('items.0.suggested_supplier.source'));
        $this->assertGreaterThan(0, (float) $response->json('items.0.unit_cost'));
    }

    public function test_create_draft_po_from_restock_supplier_group(): void
    {
        $owner = $this->makeOwner();
        $supplier = Supplier::create(['name' => 'Mill Co', 'is_active' => true]);
        $flour = InventoryItem::create([
            'name' => 'Flour',
            'sku' => 'FLR-PO',
            'unit' => 'kg',
            'current_stock' => 5,
            'reorder_point' => 20,
            'unit_cost' => 4,
            'preferred_supplier_id' => $supplier->id,
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/purchases/from-suggest', [
            'supplier_id' => $supplier->id,
            'notes' => 'Auto-generated from restock plan (due soon)',
            'items' => [
                [
                    'inventory_item_id' => $flour->id,
                    'quantity' => 40,
                    'unit_cost' => 4,
                ],
            ],
        ], $this->staffHeaders($owner));

        $response->assertCreated()
            ->assertJsonPath('purchase.status', 'draft')
            ->assertJsonPath('purchase.supplier_id', $supplier->id)
            ->assertJsonPath('purchase.notes', 'Auto-generated from restock plan (due soon)')
            ->assertJsonPath('resolved_alerts', 0);

        $this->assertDatabaseHas('purchase_items', [
            'purchase_id' => $response->json('purchase.id'),
            'inventory_item_id' => $flour->id,
            'quantity' => 40,
        ]);
    }

    public function test_create_from_suggest_can_resolve_open_reorder_alerts(): void
    {
        $owner = $this->makeOwner();
        $supplier = Supplier::create(['name' => 'Mill Co', 'is_active' => true]);
        $flour = InventoryItem::create([
            'name' => 'Flour',
            'sku' => 'FLR-ALERT-PO',
            'unit' => 'kg',
            'current_stock' => 5,
            'reorder_point' => 20,
            'unit_cost' => 4,
            'preferred_supplier_id' => $supplier->id,
            'is_active' => true,
        ]);
        $alert = InventoryReorderAlert::create([
            'inventory_item_id' => $flour->id,
            'current_stock' => 5,
            'reorder_point' => 20,
        ]);

        $response = $this->postJson('/api/purchases/from-suggest', [
            'supplier_id' => $supplier->id,
            'notes' => 'Auto-generated from restock plan (due soon)',
            'resolve_reorder_alerts' => true,
            'items' => [
                [
                    'inventory_item_id' => $flour->id,
                    'quantity' => 40,
                    'unit_cost' => 4,
                ],
            ],
        ], $this->staffHeaders($owner));

        $response->assertCreated()
            ->assertJsonPath('resolved_alerts', 1);

        $this->assertNotNull($alert->fresh()->resolved_at);
    }

    public function test_auto_suggest_uses_usage_cover_when_higher(): void
    {
        $owner = $this->makeOwner();

        $item = InventoryItem::create([
            'name' => 'Sugar',
            'sku' => 'SGR-RST',
            'unit' => 'kg',
            'current_stock' => 5,
            'reorder_point' => 10,
            'reorder_quantity' => 10,
            'unit_cost' => 3,
            'is_active' => true,
        ]);

        // 2 kg/day over 30 days → cover 14 days needs 28 − 5 = 23 > ROP-based 15
        StockMovement::create([
            'idempotency_key' => 'test-deduct-sugar-1',
            'inventory_item_id' => $item->id,
            'user_id' => $owner->id,
            'type' => 'deduction',
            'quantity' => -60,
            'balance_after' => 5,
            'unit_cost' => 3,
            'reference_type' => 'order',
            'reference_id' => 2,
            'notes' => 'test',
        ]);

        $response = $this->getJson(
            '/api/purchases/suggest?lookback_days=30&cover_days=14',
            $this->staffHeaders($owner),
        );

        $response->assertOk()
            ->assertJsonPath('items.0.suggestion_reason', 'usage_cover');

        $this->assertGreaterThanOrEqual(20, (float) $response->json('items.0.suggested_quantity'));
    }

    public function test_restock_requires_auth(): void
    {
        $this->getJson('/api/forecasts/restock')->assertStatus(401);
    }

    public function test_restock_plan_flags_open_purchase_orders(): void
    {
        $owner = $this->makeOwner();
        $supplier = Supplier::create(['name' => 'Mill Co', 'is_active' => true]);
        $flour = InventoryItem::create([
            'name' => 'Flour Open',
            'sku' => 'FLR-OPEN',
            'unit' => 'kg',
            'current_stock' => 5,
            'reorder_point' => 20,
            'unit_cost' => 4,
            'is_active' => true,
        ]);

        StockMovement::create([
            'idempotency_key' => 'test-deduct-flour-open',
            'inventory_item_id' => $flour->id,
            'user_id' => $owner->id,
            'type' => 'deduction',
            'quantity' => -40,
            'balance_after' => 5,
            'unit_cost' => 4,
            'reference_type' => 'order',
            'reference_id' => 11,
            'notes' => 'test',
        ]);

        $po = Purchase::create([
            'purchase_number' => 'PO-OPEN-1',
            'supplier_id' => $supplier->id,
            'user_id' => $owner->id,
            'status' => 'draft',
            'subtotal' => 160,
            'tax_amount' => 0,
            'total' => 160,
            'purchase_date' => now()->toDateString(),
        ]);
        PurchaseItem::create([
            'purchase_id' => $po->id,
            'inventory_item_id' => $flour->id,
            'quantity' => 40,
            'unit_cost' => 4,
            'total_cost' => 160,
        ]);

        $response = $this->getJson(
            '/api/forecasts/restock?lookback_days=30',
            $this->staffHeaders($owner),
        );

        $response->assertOk()
            ->assertJsonPath('items.0.name', 'Flour Open')
            ->assertJsonPath('items.0.open_purchase.purchase_number', 'PO-OPEN-1')
            ->assertJsonPath('items.0.open_purchase.status', 'draft')
            ->assertJsonPath('totals.with_open_po', 1);
    }

    public function test_apply_suggested_rop_updates_inventory(): void
    {
        $owner = $this->makeOwner();

        $item = InventoryItem::create([
            'name' => 'Butter',
            'sku' => 'BTR-ROP',
            'unit' => 'kg',
            'current_stock' => 8,
            'reorder_point' => 1,
            'unit_cost' => 10,
            'is_active' => true,
        ]);

        // ~2 kg/day → suggested ROP = 2 * lead(3) * 1.5 = 9
        StockMovement::create([
            'idempotency_key' => 'test-deduct-butter-rop',
            'inventory_item_id' => $item->id,
            'user_id' => $owner->id,
            'type' => 'deduction',
            'quantity' => -60,
            'balance_after' => 8,
            'unit_cost' => 10,
            'reference_type' => 'order',
            'reference_id' => 9,
            'notes' => 'test',
        ]);

        $plan = $this->getJson(
            '/api/forecasts/restock?lookback_days=30&lead_days=3',
            $this->staffHeaders($owner),
        );
        $plan->assertOk();
        $suggested = (float) $plan->json('items.0.suggested_reorder_point');
        $this->assertGreaterThan(1, $suggested);

        $response = $this->postJson('/api/forecasts/restock/apply-rop', [
            'item_ids' => [$item->id],
            'lookback_days' => 30,
            'lead_days' => 3,
        ], $this->staffHeaders($owner));

        $response->assertOk()
            ->assertJsonPath('updated_count', 1)
            ->assertJsonPath('updated.0.id', $item->id);

        $this->assertEqualsWithDelta(
            $suggested,
            (float) $item->fresh()->reorder_point,
            0.01,
        );

        // Second apply should skip as unchanged
        $again = $this->postJson('/api/forecasts/restock/apply-rop', [
            'item_ids' => [$item->id],
            'lookback_days' => 30,
            'lead_days' => 3,
        ], $this->staffHeaders($owner));

        $again->assertOk()
            ->assertJsonPath('updated_count', 0)
            ->assertJsonPath('skipped.0.reason', 'unchanged');
    }

    public function test_restock_plan_flags_price_increase_vs_last_purchase(): void
    {
        $owner = $this->makeOwner();
        $supplier = Supplier::create(['name' => 'Spice Co', 'is_active' => true]);
        $item = InventoryItem::create([
            'name' => 'Chili',
            'sku' => 'CHL-PRICE',
            'unit' => 'kg',
            'current_stock' => 2,
            'reorder_point' => 10,
            'unit_cost' => 8,
            'last_purchase_price' => 8,
            'is_active' => true,
        ]);

        SupplierPriceHistory::create([
            'supplier_id' => $supplier->id,
            'inventory_item_id' => $item->id,
            'unit_price' => 10,
            'unit' => 'kg',
            'recorded_at' => now()->toDateString(),
        ]);

        $response = $this->getJson(
            '/api/forecasts/restock?lookback_days=30&lead_days=3',
            $this->staffHeaders($owner),
        );

        $response->assertOk()
            ->assertJsonPath('items.0.name', 'Chili')
            ->assertJsonPath('items.0.price_change', 'up')
            ->assertJsonPath('items.0.last_purchase_price', 8)
            ->assertJsonPath('totals.price_up', 1);

        $this->assertEqualsWithDelta(25.0, (float) $response->json('items.0.price_change_pct'), 0.1);
        $this->assertEqualsWithDelta(10.0, (float) $response->json('items.0.unit_cost'), 0.01);
    }

    public function test_apply_suggested_preferred_promotes_cheapest_supplier(): void
    {
        $owner = $this->makeOwner();
        $supplier = Supplier::create(['name' => 'Bulk Foods', 'is_active' => true]);
        $item = InventoryItem::create([
            'name' => 'Rice',
            'sku' => 'RCE-PREF',
            'unit' => 'kg',
            'current_stock' => 3,
            'reorder_point' => 20,
            'unit_cost' => 5,
            'last_purchase_price' => 5,
            'preferred_supplier_id' => null,
            'is_active' => true,
        ]);

        SupplierPriceHistory::create([
            'supplier_id' => $supplier->id,
            'inventory_item_id' => $item->id,
            'unit_price' => 5.5,
            'unit' => 'kg',
            'recorded_at' => now()->toDateString(),
        ]);

        $plan = $this->getJson('/api/forecasts/restock?lookback_days=30', $this->staffHeaders($owner));
        $plan->assertOk()
            ->assertJsonPath('items.0.suggested_supplier.source', 'cheapest')
            ->assertJsonPath('items.0.suggested_supplier.id', $supplier->id);

        $response = $this->postJson('/api/forecasts/restock/apply-preferred', [
            'item_ids' => [$item->id],
            'lookback_days' => 30,
        ], $this->staffHeaders($owner));

        $response->assertOk()
            ->assertJsonPath('updated_count', 1)
            ->assertJsonPath('updated.0.supplier_id', $supplier->id);

        $this->assertSame($supplier->id, (int) $item->fresh()->preferred_supplier_id);

        $again = $this->postJson('/api/forecasts/restock/apply-preferred', [
            'item_ids' => [$item->id],
            'lookback_days' => 30,
        ], $this->staffHeaders($owner));

        $again->assertOk()
            ->assertJsonPath('updated_count', 0)
            ->assertJsonPath('skipped.0.reason', 'not_cheapest_suggestion');
    }

    public function test_restock_plan_uses_per_item_lead_days_for_suggested_rop(): void
    {
        $owner = $this->makeOwner();

        $short = InventoryItem::create([
            'name' => 'Yeast',
            'sku' => 'YST-LEAD',
            'unit' => 'kg',
            'current_stock' => 10,
            'reorder_point' => 5,
            'unit_cost' => 20,
            'lead_days' => null,
            'is_active' => true,
        ]);
        $long = InventoryItem::create([
            'name' => 'Olive Oil',
            'sku' => 'OIL-LEAD',
            'unit' => 'L',
            'current_stock' => 10,
            'reorder_point' => 5,
            'unit_cost' => 40,
            'lead_days' => 10,
            'is_active' => true,
        ]);

        foreach ([$short, $long] as $i => $item) {
            StockMovement::create([
                'idempotency_key' => 'test-lead-deduct-'.$i,
                'inventory_item_id' => $item->id,
                'user_id' => $owner->id,
                'type' => 'deduction',
                'quantity' => -30,
                'balance_after' => 10,
                'unit_cost' => 1,
                'reference_type' => 'order',
                'reference_id' => 100 + $i,
                'notes' => 'test',
            ]);
        }

        $response = $this->getJson(
            '/api/forecasts/restock?lookback_days=30&lead_days=3',
            $this->staffHeaders($owner),
        );
        $response->assertOk();

        $byName = collect($response->json('items'))->keyBy('name');
        $this->assertSame('default', $byName['Yeast']['lead_days_source']);
        $this->assertSame(3, (int) $byName['Yeast']['lead_days']);
        $this->assertSame('item', $byName['Olive Oil']['lead_days_source']);
        $this->assertSame(10, (int) $byName['Olive Oil']['lead_days']);

        // Same daily usage (~1/day): ROP = rate * max(1, lead) * 1.5 → longer lead ⇒ higher ROP
        $this->assertGreaterThan(
            (float) $byName['Yeast']['suggested_reorder_point'],
            (float) $byName['Olive Oil']['suggested_reorder_point'],
        );
    }

    public function test_restock_plan_includes_open_reorder_alert_and_resolve(): void
    {
        $owner = $this->makeOwner();
        $item = InventoryItem::create([
            'name' => 'Salt',
            'sku' => 'SLT-ALERT',
            'unit' => 'kg',
            'current_stock' => 2,
            'reorder_point' => 10,
            'unit_cost' => 1,
            'is_active' => true,
        ]);

        $alert = InventoryReorderAlert::create([
            'inventory_item_id' => $item->id,
            'current_stock' => 2,
            'reorder_point' => 10,
        ]);

        $plan = $this->getJson('/api/forecasts/restock?lookback_days=30', $this->staffHeaders($owner));
        $plan->assertOk()
            ->assertJsonPath('totals.open_alerts', 1)
            ->assertJsonPath('items.0.name', 'Salt')
            ->assertJsonPath('items.0.open_alert.id', $alert->id);

        $resolve = $this->postJson(
            "/api/inventory/reorder-alerts/{$alert->id}/resolve",
            [],
            $this->staffHeaders($owner),
        );
        $resolve->assertOk();

        $this->assertNotNull($alert->fresh()->resolved_at);

        $after = $this->getJson('/api/forecasts/restock?lookback_days=30', $this->staffHeaders($owner));
        $after->assertOk()
            ->assertJsonPath('totals.open_alerts', 0)
            ->assertJsonPath('items.0.open_alert', null);
    }
}
