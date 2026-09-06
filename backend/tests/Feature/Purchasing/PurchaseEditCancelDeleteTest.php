<?php

declare(strict_types=1);

namespace Tests\Feature\Purchasing;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\InventoryPurchaseUnit;
use App\Models\Purchase;
use App\Models\StockMovement;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Editing, cancelling and deleting a purchase order.
 *
 * Owner, 2026-09-06: "how to cancel/delete or edit the po, admin must be able
 * to do that." Only cancelling existed, under the name "Reject"; the header
 * could be edited and not one line; nothing deleted anything, so an order
 * raised by mistake was permanent.
 *
 * One rule decides all three: a purchase order that has moved stock or money
 * must never be quietly rewritten. Before anything arrives it is a piece of
 * paper. Afterwards it is evidence — a stock movement, a weighted-average
 * cost, a price-history row — and editing the line underneath those would
 * leave the ledger describing an order that never happened.
 */
class PurchaseEditCancelDeleteTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    private function item(string $name, string $sku, string $unit = 'piece'): InventoryItem
    {
        return InventoryItem::create([
            'name' => $name,
            'sku' => $sku,
            'unit' => $unit,
            'current_stock' => 0,
            'unit_cost' => 0,
            'is_active' => true,
        ]);
    }

    /** A draft order for 10 of something at MVR 5. */
    private function draft(InventoryItem $item, float $qty = 10, float $cost = 5): Purchase
    {
        $res = $this->postJson('/api/purchases', [
            'supplier_id' => Supplier::create(['name' => 'Fahi Store', 'is_active' => true])->id,
            'purchase_date' => now()->toDateString(),
            'status' => 'draft',
            'items' => [[
                'inventory_item_id' => $item->id,
                'quantity' => $qty,
                'unit_cost' => $cost,
            ]],
        ])->assertCreated();

        return Purchase::with('items')->findOrFail((int) $res->json('purchase.id'));
    }

    private function approve(Purchase $po): void
    {
        $this->postJson("/api/purchases/{$po->id}/approve")->assertOk();
    }

    private function receiveAll(Purchase $po): void
    {
        $this->postJson("/api/purchases/{$po->id}/receive", [
            'items' => $po->items->map(fn ($i) => [
                'purchase_item_id' => $i->id,
                'received_quantity' => (float) $i->quantity,
            ])->all(),
        ])->assertOk();
    }

    // ── Editing the lines ────────────────────────────────────────────────

    public function test_a_draft_line_can_be_repriced_and_the_total_follows(): void
    {
        $rice = $this->item('Rice', 'RICE-1', 'kg');
        $po = $this->draft($rice, 10, 5);

        $this->patchJson("/api/purchases/{$po->id}", [
            'items' => [['inventory_item_id' => $rice->id, 'quantity' => 10, 'unit_cost' => 7]],
        ])->assertOk();

        $po->refresh()->load('items');
        $this->assertEqualsWithDelta(7.0, (float) $po->items->first()->unit_cost, 0.001);
        $this->assertEqualsWithDelta(70.0, (float) $po->subtotal, 0.001);
    }

    public function test_a_line_can_be_added_and_another_dropped(): void
    {
        $rice = $this->item('Rice', 'RICE-1', 'kg');
        $oil = $this->item('Oil', 'OIL-1', 'L');
        $po = $this->draft($rice, 10, 5);

        $this->patchJson("/api/purchases/{$po->id}", [
            'items' => [['inventory_item_id' => $oil->id, 'quantity' => 4, 'unit_cost' => 25]],
        ])->assertOk();

        $po->refresh()->load('items');
        $this->assertCount(1, $po->items);
        $this->assertSame($oil->id, $po->items->first()->inventory_item_id);
        $this->assertEqualsWithDelta(100.0, (float) $po->subtotal, 0.001);
    }

    public function test_an_edited_line_still_divides_a_pack_down_to_the_unit(): void
    {
        // The edit runs through the same resolver the order was created with,
        // so "2 cases" prices exactly as it would have on day one.
        $eggs = $this->item('Egg', 'EGG-1');
        $case = InventoryPurchaseUnit::create([
            'inventory_item_id' => $eggs->id, 'name' => 'Case', 'base_units' => 210,
        ]);
        $po = $this->draft($eggs, 10, 5);

        $this->patchJson("/api/purchases/{$po->id}", [
            'items' => [[
                'inventory_item_id' => $eggs->id,
                'quantity' => 2,
                'unit_cost' => 415,
                'purchase_unit_id' => $case->id,
            ]],
        ])->assertOk();

        $line = $po->fresh()->load('items')->items->first();

        $this->assertEqualsWithDelta(420.0, (float) $line->quantity, 0.001);
        $this->assertEqualsWithDelta(1.976190, (float) $line->unit_cost, 0.000001);
        // The money is the pack arithmetic, not a rounded per-egg price times
        // 420 — that would restate an MVR 830 order as MVR 829.99.
        $this->assertEqualsWithDelta(830.0, (float) $line->total_cost, 0.01);
    }

    public function test_an_approved_order_with_nothing_in_yet_is_still_editable(): void
    {
        // It is still only a piece of paper until a crate lands.
        $rice = $this->item('Rice', 'RICE-1', 'kg');
        $po = $this->draft($rice, 10, 5);
        $this->approve($po);

        $this->patchJson("/api/purchases/{$po->id}", [
            'items' => [['inventory_item_id' => $rice->id, 'quantity' => 20, 'unit_cost' => 5]],
        ])->assertOk();

        $this->assertEqualsWithDelta(20.0, (float) $po->fresh()->load('items')->items->first()->quantity, 0.001);
    }

    public function test_a_received_order_refuses_a_line_edit(): void
    {
        $rice = $this->item('Rice', 'RICE-1', 'kg');
        $po = $this->draft($rice, 10, 5);
        $this->approve($po);
        $this->receiveAll($po->fresh()->load('items'));

        $this->patchJson("/api/purchases/{$po->id}", [
            'items' => [['inventory_item_id' => $rice->id, 'quantity' => 999, 'unit_cost' => 1]],
        ])->assertStatus(422);

        // And the stock it already moved is untouched.
        $this->assertEqualsWithDelta(10.0, (float) $rice->fresh()->current_stock, 0.001);
    }

    public function test_a_header_only_edit_still_works_on_a_received_order(): void
    {
        // Notes and the supplier invoice number are not the ledger. Only the
        // lines are frozen.
        $rice = $this->item('Rice', 'RICE-1', 'kg');
        $po = $this->draft($rice, 10, 5);
        $this->approve($po);
        $this->receiveAll($po->fresh()->load('items'));

        $this->patchJson("/api/purchases/{$po->id}", ['notes' => 'Invoice filed'])->assertOk();

        $this->assertStringContainsString('Invoice filed', (string) $po->fresh()->notes);
    }

    // ── Cancelling ───────────────────────────────────────────────────────

    public function test_a_draft_can_be_cancelled_with_a_reason(): void
    {
        $po = $this->draft($this->item('Rice', 'RICE-1', 'kg'));

        $this->postJson("/api/purchases/{$po->id}/cancel", ['reason' => 'Ordered twice'])->assertOk();

        $po->refresh();
        $this->assertSame('cancelled', $po->status);
        $this->assertStringContainsString('Ordered twice', (string) $po->notes);
    }

    public function test_a_part_delivered_order_can_be_short_closed(): void
    {
        /*
         * The everyday case: the supplier brought half and cannot bring the
         * rest. Cancelling closes the order and must not touch what came in.
         */
        $rice = $this->item('Rice', 'RICE-1', 'kg');
        $po = $this->draft($rice, 10, 5);
        $this->approve($po);
        $this->postJson("/api/purchases/{$po->id}/receive", [
            'items' => [['purchase_item_id' => $po->fresh()->load('items')->items->first()->id, 'received_quantity' => 4]],
        ])->assertOk();

        $this->postJson("/api/purchases/{$po->id}/cancel", ['reason' => 'Supplier out of stock'])->assertOk();

        $this->assertSame('cancelled', $po->fresh()->status);
        $this->assertEqualsWithDelta(4.0, (float) $rice->fresh()->current_stock, 0.001);
    }

    public function test_a_fully_received_order_cannot_be_cancelled(): void
    {
        // Cancelling would not put the stock back, so it would only make the
        // record disagree with the shelf.
        $rice = $this->item('Rice', 'RICE-1', 'kg');
        $po = $this->draft($rice, 10, 5);
        $this->approve($po);
        $this->receiveAll($po->fresh()->load('items'));

        $this->postJson("/api/purchases/{$po->id}/cancel")->assertStatus(422);
        $this->assertSame('received', $po->fresh()->status);
    }

    public function test_reject_still_works_and_means_cancel(): void
    {
        // The old name, kept so nothing in flight breaks.
        $po = $this->draft($this->item('Rice', 'RICE-1', 'kg'));

        $this->postJson("/api/purchases/{$po->id}/reject", ['reason' => 'No longer needed'])->assertOk();

        $this->assertSame('cancelled', $po->fresh()->status);
    }

    // ── Deleting ─────────────────────────────────────────────────────────

    public function test_a_draft_can_be_deleted_and_leaves_the_list(): void
    {
        $po = $this->draft($this->item('Rice', 'RICE-1', 'kg'));

        $this->deleteJson("/api/purchases/{$po->id}")->assertOk();

        $this->assertNull(Purchase::find($po->id));
        $numbers = collect($this->getJson('/api/purchases')->assertOk()->json('purchases.data'))
            ->pluck('purchase_number');
        $this->assertNotContains($po->purchase_number, $numbers->all());
    }

    public function test_a_deleted_order_is_still_there_for_an_auditor(): void
    {
        // Soft, so the owner gets it off the screen and the trail survives.
        $po = $this->draft($this->item('Rice', 'RICE-1', 'kg'));

        $this->deleteJson("/api/purchases/{$po->id}")->assertOk();

        $this->assertNotNull(Purchase::withTrashed()->find($po->id));
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'purchase.deleted',
            'model_id' => $po->id,
        ]);
    }

    public function test_a_cancelled_order_that_received_nothing_can_be_deleted(): void
    {
        $po = $this->draft($this->item('Rice', 'RICE-1', 'kg'));
        $this->postJson("/api/purchases/{$po->id}/cancel", ['reason' => 'Mistake'])->assertOk();

        $this->deleteJson("/api/purchases/{$po->id}")->assertOk();

        $this->assertNull(Purchase::find($po->id));
    }

    public function test_an_approved_order_cannot_be_deleted_only_cancelled(): void
    {
        // Somebody signed it off. A purchase that vanishes from the record is
        // how a trail goes missing.
        $po = $this->draft($this->item('Rice', 'RICE-1', 'kg'));
        $this->approve($po);

        $this->deleteJson("/api/purchases/{$po->id}")->assertStatus(422);
        $this->assertNotNull(Purchase::find($po->id));
    }

    public function test_an_order_stock_arrived_against_can_never_be_deleted(): void
    {
        $rice = $this->item('Rice', 'RICE-1', 'kg');
        $po = $this->draft($rice, 10, 5);
        $this->approve($po);
        $this->receiveAll($po->fresh()->load('items'));

        $this->deleteJson("/api/purchases/{$po->id}")->assertStatus(422);

        $this->assertNotNull(Purchase::find($po->id));
        // The movement it produced is what makes it a record.
        $this->assertGreaterThan(0, StockMovement::where('inventory_item_id', $rice->id)->count());
    }

    // ── What the screen is told ──────────────────────────────────────────

    public function test_the_list_says_what_may_be_done_to_each_order(): void
    {
        // So a button is shown or explained, rather than guessed at from the
        // status — which cannot see whether a crate already landed.
        $po = $this->draft($this->item('Rice', 'RICE-1', 'kg'));

        $row = collect($this->getJson('/api/purchases')->assertOk()->json('purchases.data'))
            ->firstWhere('id', $po->id);

        $this->assertTrue($row['can_edit']);
        $this->assertTrue($row['can_cancel']);
        $this->assertTrue($row['can_delete']);
    }

    public function test_a_blocked_action_comes_back_with_the_reason(): void
    {
        $rice = $this->item('Rice', 'RICE-1', 'kg');
        $po = $this->draft($rice, 10, 5);
        $this->approve($po);
        $this->receiveAll($po->fresh()->load('items'));

        $row = $this->getJson("/api/purchases/{$po->id}")->assertOk()->json('purchase');

        $this->assertFalse($row['can_edit']);
        $this->assertFalse($row['can_delete']);
        $this->assertNotEmpty($row['edit_blocked_reason']);
        $this->assertStringContainsString('received', strtolower((string) $row['edit_blocked_reason']));
    }

    public function test_all_three_need_the_purchasing_permission(): void
    {
        $po = $this->draft($this->item('Rice', 'RICE-1', 'kg'));
        $outsider = $this->makeStaff('staff');
        $outsider->revokePermission('suppliers.purchases');
        $outsider->unsetRelation('permissions');
        Sanctum::actingAs($outsider, ['staff']);

        $this->patchJson("/api/purchases/{$po->id}", ['notes' => 'x'])->assertForbidden();
        $this->postJson("/api/purchases/{$po->id}/cancel")->assertForbidden();
        $this->deleteJson("/api/purchases/{$po->id}")->assertForbidden();
    }
}
