<?php

declare(strict_types=1);

namespace Tests\Feature\Gst;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-07: the monthly sheet says how much GST is blocked; the
 * "to claim" list says which documents, so somebody can chase the invoice.
 */
class GstToClaimTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    private function purchase(array $extra = []): Purchase
    {
        $water = InventoryItem::firstOrCreate(['sku' => 'WATER-1'], [
            'name' => 'Water bottle', 'unit' => 'pcs', 'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true, 'gst_rate_bp' => 800,
        ]);
        $supplier = Supplier::firstOrCreate(['name' => 'Island Beverages'], ['is_active' => true]);

        $res = $this->postJson('/api/purchases', array_merge([
            'supplier_id' => $supplier->id,
            'purchase_date' => now()->toDateString(),
            'status' => 'draft',
            'items' => [['inventory_item_id' => $water->id, 'quantity' => 10, 'unit_cost' => 10.80]],
        ], $extra))->assertCreated();

        return Purchase::findOrFail($res->json('purchase.id'));
    }

    public function test_lists_gst_bearing_purchases_that_are_not_claimed_and_what_they_are_missing(): void
    {
        $blocked = $this->purchase();

        $claimed = $this->purchase();
        $this->patchJson("/api/purchases/{$claimed->id}", [
            'is_input_tax_claimable' => true,
            'supplier_tin' => '1234567GST501',
            'supplier_invoice_no' => 'INV-1',
            'supplier_invoice_date' => now()->toDateString(),
        ])->assertOk();

        $cancelled = $this->purchase();
        $cancelled->update(['status' => 'cancelled']);

        $res = $this->getJson('/api/reports/finance/gst/to-claim?period=' . now()->format('Y-m'))->assertOk()->json();

        $this->assertSame(1, $res['count']);
        $this->assertSame(800, $res['total_laar']);
        $row = $res['rows'][0];
        $this->assertSame('purchase', $row['kind']);
        $this->assertSame($blocked->id, $row['id']);
        $this->assertSame('Island Beverages', $row['supplier']);
        $this->assertSame(800, $row['gst_laar']);
        $this->assertSame(10800, $row['total_laar']);
        $this->assertSame(['supplier TIN', 'invoice number', 'invoice date'], $row['missing']);
    }

    public function test_only_the_asked_period_and_only_documents_with_gst(): void
    {
        $this->purchase(['purchase_date' => now()->subMonths(2)->toDateString()]);
        $flour = InventoryItem::create(['name' => 'Flour', 'sku' => 'FLOUR-1', 'unit' => 'kg', 'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true]);
        $this->postJson('/api/purchases', [
            'supplier_id' => Supplier::firstOrCreate(['name' => 'Mill'], ['is_active' => true])->id,
            'purchase_date' => now()->toDateString(),
            'status' => 'draft',
            'items' => [['inventory_item_id' => $flour->id, 'quantity' => 5, 'unit_cost' => 20]],
        ])->assertCreated();

        $res = $this->getJson('/api/reports/finance/gst/to-claim?period=' . now()->format('Y-m'))->assertOk()->json();
        $this->assertSame(0, $res['count']);
        $this->assertSame([], $res['rows']);

        $old = $this->getJson('/api/reports/finance/gst/to-claim?period=' . now()->subMonths(2)->format('Y-m'))->assertOk()->json();
        $this->assertSame(1, $old['count']);
    }

    public function test_needs_the_financial_reports_permission(): void
    {
        Sanctum::actingAs($this->makeStaff(), ['staff']);
        $this->getJson('/api/reports/finance/gst/to-claim?period=' . now()->format('Y-m'))->assertForbidden();
    }
}
