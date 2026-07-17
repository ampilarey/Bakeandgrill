<?php

declare(strict_types=1);

namespace Tests\Feature\Reports;

use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SpendByItemReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_spend_by_item_aggregates_received_purchase_lines(): void
    {
        $owner = $this->makeOwner();
        $this->actingAs($owner);

        $supplierA = Supplier::create(['name' => 'Cheap Flour Co', 'is_active' => true]);
        $supplierB = Supplier::create(['name' => 'Pricey Mills', 'is_active' => true]);
        $flour = InventoryItem::create([
            'name' => 'Flour',
            'sku' => 'FLR-SPEND',
            'unit' => 'kg',
            'current_stock' => 0,
            'unit_cost' => 0,
            'is_active' => true,
        ]);

        $today = now()->toDateString();

        $poCheap = Purchase::create([
            'purchase_number' => 'PO-SPEND-1',
            'supplier_id' => $supplierA->id,
            'user_id' => $owner->id,
            'status' => 'received',
            'subtotal' => 100,
            'tax_amount' => 0,
            'total' => 100,
            'purchase_date' => $today,
            'actual_delivery_date' => $today,
        ]);
        PurchaseItem::create([
            'purchase_id' => $poCheap->id,
            'inventory_item_id' => $flour->id,
            'quantity' => 10,
            'received_quantity' => 10,
            'receive_status' => 'complete',
            'unit_cost' => 10,
            'total_cost' => 100,
        ]);

        $poPricey = Purchase::create([
            'purchase_number' => 'PO-SPEND-2',
            'supplier_id' => $supplierB->id,
            'user_id' => $owner->id,
            'status' => 'partial',
            'subtotal' => 75,
            'tax_amount' => 0,
            'total' => 75,
            'purchase_date' => $today,
            'actual_delivery_date' => $today,
        ]);
        PurchaseItem::create([
            'purchase_id' => $poPricey->id,
            'inventory_item_id' => $flour->id,
            'quantity' => 10,
            'received_quantity' => 5,
            'receive_status' => 'partial',
            'unit_cost' => 15,
            'total_cost' => 150,
        ]);

        $response = $this->getJson('/api/reports/spend-by-item?from='.$today.'&to='.$today);

        $response->assertOk()
            ->assertJsonPath('totals.items_count', 1)
            ->assertJsonPath('totals.qty_received', 15)
            ->assertJsonPath('totals.total_spend', 175)
            ->assertJsonPath('rows.0.item_name', 'Flour')
            ->assertJsonPath('rows.0.cheapest_supplier', 'Cheap Flour Co')
            ->assertJsonPath('rows.0.last_supplier', 'Pricey Mills');
    }

    public function test_spend_by_item_requires_auth(): void
    {
        $this->getJson('/api/reports/spend-by-item?from='.now()->toDateString().'&to='.now()->toDateString())
            ->assertStatus(401);
    }
}
