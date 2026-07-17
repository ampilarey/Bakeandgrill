<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\StockMovement;
use App\Models\Supplier;
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
            ->assertJsonPath('purchase.notes', 'Auto-generated from restock plan (due soon)');

        $this->assertDatabaseHas('purchase_items', [
            'purchase_id' => $response->json('purchase.id'),
            'inventory_item_id' => $flour->id,
            'quantity' => 40,
        ]);
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
}
