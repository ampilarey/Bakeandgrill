<?php

declare(strict_types=1);

namespace Tests\Feature\Gst;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Reporting\Support\PurchaseSpendQuery;
use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\Supplier;
use App\Models\TaxLedgerEntry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-06: "gst not return in cafe." Owner, 2026-09-07: "I remember
 * I told you no GST return, but some items are eligible for GST return."
 *
 * GST is a fact about the item. A line for such an item carries the 8%
 * inside its typed price; the purchase adds its lines up; and once the
 * supplier's tax invoice is on file that GST comes back, so it stops being
 * cost. Without the invoice it is shown, blocked, and stays in the cost.
 */
class InputGstPerItemTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    private function water(): InventoryItem
    {
        return InventoryItem::firstOrCreate(['sku' => 'WATER-1'], [
            'name' => 'Water bottle', 'unit' => 'pcs', 'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true,
            // Bought with 8% GST that comes back.
            'gst_rate_bp' => 800,
        ]);
    }

    private function flour(): InventoryItem
    {
        return InventoryItem::firstOrCreate(['sku' => 'FLOUR-1'], [
            'name' => 'Flour', 'unit' => 'kg', 'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true,
        ]);
    }

    private function supplier(): Supplier
    {
        return Supplier::firstOrCreate(['name' => 'Island Beverages'], ['is_active' => true, 'tin' => '1234567GST501']);
    }

    /** 10 bottles at 10.80 (GST inside) and 5 kg flour at 20: MVR 208 handed over. */
    private function order(array $extra = []): Purchase
    {
        $res = $this->postJson('/api/purchases', array_merge([
            'supplier_id' => $this->supplier()->id,
            'purchase_date' => now()->toDateString(),
            'status' => 'draft',
            'items' => [
                ['inventory_item_id' => $this->water()->id, 'quantity' => 10, 'unit_cost' => 10.80],
                ['inventory_item_id' => $this->flour()->id, 'quantity' => 5, 'unit_cost' => 20],
            ],
        ], $extra))->assertCreated();

        return Purchase::findOrFail($res->json('purchase.id'));
    }

    private function receiveAll(Purchase $po): void
    {
        $this->postJson("/api/purchases/{$po->id}/approve")->assertOk();
        $this->postJson("/api/purchases/{$po->id}/receive", [
            'items' => $po->items->map(fn ($l) => ['purchase_item_id' => $l->id, 'received_quantity' => (float) $l->quantity])->all(),
        ])->assertOk();
    }

    public function test_an_item_flagged_for_gst_puts_the_gst_inside_its_price_on_the_line(): void
    {
        $po = $this->order();
        $lines = $po->items->keyBy('inventory_item_id');

        // 108.00 at 8% holds 8.00; flour has none.
        $this->assertSame(800, $lines[$this->water()->id]->gst_rate_bp);
        $this->assertSame(800, $lines[$this->water()->id]->gst_laar);
        $this->assertNull($lines[$this->flour()->id]->gst_rate_bp);
        $this->assertSame(0, $lines[$this->flour()->id]->gst_laar);

        // The purchase adds it up. Typed prices stay the money handed over.
        $this->assertSame(800, $po->gst_laar);
        $this->assertSame(20800, $po->total_laar);
        // The base the GST was charged on: the water, not the flour.
        $this->assertSame(10000, $po->amount_excluding_gst_laar);
        $this->assertSame(208.0, (float) $po->total);
        // No tax invoice yet: shown, not claimable, and it says why.
        $this->assertFalse((bool) $po->is_input_tax_claimable);
        $this->assertStringContainsString('MVR 8.00 of GST not claimed', (string) $po->claim_block_reason);
    }

    public function test_a_line_can_override_the_item_default_either_way(): void
    {
        $res = $this->postJson('/api/purchases', [
            'supplier_id' => $this->supplier()->id,
            'purchase_date' => now()->toDateString(),
            'status' => 'draft',
            'items' => [
                // This time the water came from a shop with no GST invoice.
                ['inventory_item_id' => $this->water()->id, 'quantity' => 10, 'unit_cost' => 10.80, 'gst_rate_bp' => 0],
                // And the flour, for once, carried GST.
                ['inventory_item_id' => $this->flour()->id, 'quantity' => 5, 'unit_cost' => 21.60, 'gst_rate_bp' => 800],
            ],
        ])->assertCreated();
        $po = Purchase::findOrFail($res->json('purchase.id'));
        $lines = $po->items->keyBy('inventory_item_id');

        $this->assertSame(0, $lines[$this->water()->id]->gst_laar);
        $this->assertSame(800, $lines[$this->flour()->id]->gst_laar);
        $this->assertSame(800, $po->gst_laar);
    }

    public function test_with_a_tax_invoice_on_file_the_gst_comes_back_and_leaves_the_cost(): void
    {
        $po = $this->order();

        // Blocked until the invoice details arrive: the cost is the full 208.
        $this->receiveAll($po);
        $this->assertSame(208.0, PurchaseSpendQuery::total(now()->toDateString(), now()->toDateString()));
        $this->assertSame(0.0, PurchaseSpendQuery::claimableGst(now()->toDateString(), now()->toDateString()));
        $this->assertSame(8.0, PurchaseSpendQuery::blockedGst(now()->toDateString(), now()->toDateString()));
        $this->assertFalse((bool) TaxLedgerEntry::where('source_type', 'purchase')->where('source_id', $po->id)->value('is_claimable'));

        // The tax invoice turns up. Nothing is retyped — the lines already know.
        $this->patchJson("/api/purchases/{$po->id}", [
            'is_input_tax_claimable' => true,
            'supplier_tin' => '1234567GST501',
            'supplier_invoice_no' => 'INV-77',
            'supplier_invoice_date' => now()->toDateString(),
        ])->assertOk();

        $po->refresh();
        $this->assertTrue((bool) $po->is_input_tax_claimable);
        $this->assertNull($po->claim_block_reason);
        $this->assertSame(800, $po->gst_laar);

        // Cost is now what was paid less what comes back: 208 − 8.
        $this->assertSame(200.0, PurchaseSpendQuery::total(now()->toDateString(), now()->toDateString()));
        $this->assertSame(8.0, PurchaseSpendQuery::claimableGst(now()->toDateString(), now()->toDateString()));
        $this->assertSame(0.0, PurchaseSpendQuery::blockedGst(now()->toDateString(), now()->toDateString()));

        // The monthly sheet shows the same story, and the GST return sees the claim.
        $sheet = $this->getJson('/api/reports/finance/monthly-sheet?month=' . now()->format('Y-m'))->assertOk()->json();
        $this->assertSame(200.0, (float) $sheet['ingredients']);
        $this->assertSame(8.0, (float) $sheet['gst_back_on_purchases']);
        $this->assertSame(0.0, (float) $sheet['gst_blocked_on_purchases']);

        // The receive already posted a blocked entry; re-posting after the
        // invoice arrived is what the next receive or backfill does. Here
        // the ledger is re-read through the poster to prove the numbers.
        $entry = app(\App\Domains\Gst\Services\GstLedgerPoster::class)->postPurchaseInput($po->fresh('items'));
        $this->assertTrue((bool) $entry->is_claimable);
        $this->assertSame(800, $entry->tax_laar);
        $this->assertSame(10000, $entry->taxable_value_laar);
    }

    public function test_the_item_cost_recorded_at_receipt_is_net_of_gst_that_comes_back(): void
    {
        $po = $this->order();
        $this->patchJson("/api/purchases/{$po->id}", [
            'is_input_tax_claimable' => true,
            'supplier_tin' => '1234567GST501',
            'supplier_invoice_no' => 'INV-78',
            'supplier_invoice_date' => now()->toDateString(),
        ])->assertOk();
        $this->receiveAll($po);

        // 10.80 typed, 10.00 is what a bottle really cost.
        $this->assertEqualsWithDelta(10.0, (float) $this->water()->fresh()->unit_cost, 0.001);
        // Flour had no GST: 20 stays 20.
        $this->assertEqualsWithDelta(20.0, (float) $this->flour()->fresh()->unit_cost, 0.001);
    }

    public function test_the_claim_needs_the_tax_invoice_details(): void
    {
        $po = $this->order();
        $this->patchJson("/api/purchases/{$po->id}", ['is_input_tax_claimable' => true])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['supplier_tin', 'supplier_invoice_no', 'supplier_invoice_date']);
    }

    public function test_an_inventory_item_can_be_marked_as_bought_with_gst(): void
    {
        $flour = $this->flour();
        $this->patchJson("/api/inventory/{$flour->id}", ['gst_rate_bp' => 800])->assertOk();
        $this->assertSame(800, $flour->fresh()->gst_rate_bp);
        $this->patchJson("/api/inventory/{$flour->id}", ['gst_rate_bp' => 0])->assertOk();
        $this->assertSame(0, $flour->fresh()->gst_rate_bp);
    }

    public function test_a_purchase_with_no_gst_lines_is_untouched(): void
    {
        $res = $this->postJson('/api/purchases', [
            'supplier_id' => $this->supplier()->id,
            'purchase_date' => now()->toDateString(),
            'status' => 'draft',
            'items' => [['inventory_item_id' => $this->flour()->id, 'quantity' => 5, 'unit_cost' => 20]],
        ])->assertCreated();
        $po = Purchase::findOrFail($res->json('purchase.id'));

        $this->assertSame(0, (int) $po->gst_laar);
        $this->assertFalse((bool) $po->is_input_tax_claimable);
        $this->assertNull($po->claim_block_reason);
    }
}
