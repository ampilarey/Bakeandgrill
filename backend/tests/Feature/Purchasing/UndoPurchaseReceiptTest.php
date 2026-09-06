<?php

declare(strict_types=1);

namespace Tests\Feature\Purchasing;

use App\Domains\Gst\Services\GstPeriodService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\AuditLog;
use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\SupplierPriceHistory;
use App\Models\TaxLedgerEntry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Undoing a delivery, so a received order is not a dead end.
 *
 * Owner, 2026-09-06: "fuck u, how can admin del or edit PO?" — with a
 * screenshot of three orders, all `received`, all reading "Received — locked".
 * The edit/cancel/delete policy was right that a purchase which moved stock
 * must not be quietly rewritten, and useless: it locked every order the
 * business had and offered no way out.
 *
 * The way out is a reversal, not an erasure. These tests hold that it really
 * reverses — stock, prices, tax, status — and that what it cannot put right it
 * says out loud instead of hiding.
 */
class UndoPurchaseReceiptTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    private function rice(float $stock = 0): InventoryItem
    {
        return InventoryItem::create([
            'name' => 'Rice',
            'sku' => 'RICE-1',
            'unit' => 'kg',
            'current_stock' => $stock,
            'unit_cost' => 0,
            'is_active' => true,
        ]);
    }

    /** Ten sacks at MVR 20, approved and fully received. */
    private function receivedOrder(?InventoryItem $item = null): Purchase
    {
        $item ??= $this->rice();

        $res = $this->postJson('/api/purchases', [
            'supplier_id' => Supplier::firstOrCreate(['name' => 'Fahi Store'], ['is_active' => true])->id,
            'purchase_date' => now()->toDateString(),
            'status' => 'draft',
            'items' => [['inventory_item_id' => $item->id, 'quantity' => 10, 'unit_cost' => 20]],
        ])->assertCreated();

        $po = Purchase::with('items')->findOrFail((int) $res->json('purchase.id'));
        $this->postJson("/api/purchases/{$po->id}/approve")->assertOk();
        $this->postJson("/api/purchases/{$po->id}/receive", [
            'items' => $po->items->map(fn ($i) => [
                'purchase_item_id' => $i->id,
                'received_quantity' => 10,
            ])->all(),
        ])->assertOk();

        return $po->fresh(['items']);
    }

    private function undo(Purchase $po, string $reason = 'Received against the wrong order')
    {
        return $this->postJson("/api/purchases/{$po->id}/undo-receipt", ['reason' => $reason]);
    }

    public function test_the_stock_goes_back_off_the_shelf(): void
    {
        $rice = $this->rice();
        $po = $this->receivedOrder($rice);
        $this->assertSame(10.0, (float) $rice->fresh()->current_stock);

        $this->undo($po)->assertOk();

        $this->assertSame(0.0, (float) $rice->fresh()->current_stock);
    }

    public function test_the_original_delivery_still_shows_in_the_history(): void
    {
        /*
         * The point of a reversal rather than an erasure: both events are
         * there, so anyone reading the movement history sees what happened and
         * what was done about it.
         */
        $rice = $this->rice();
        $po = $this->receivedOrder($rice);
        $this->undo($po, 'Delivery never arrived')->assertOk();

        $moves = StockMovement::where('inventory_item_id', $rice->id)
            ->orderBy('id')
            ->get();

        $this->assertCount(2, $moves);
        $this->assertSame('purchase', $moves[0]->type);
        $this->assertSame(10.0, (float) $moves[0]->quantity);
        $this->assertSame('adjustment', $moves[1]->type);
        $this->assertSame(-10.0, (float) $moves[1]->quantity);
        $this->assertStringContainsString('Delivery never arrived', (string) $moves[1]->notes);
    }

    public function test_the_order_goes_back_to_ordered_with_nothing_received(): void
    {
        $po = $this->receivedOrder();
        $this->undo($po)->assertOk();

        $fresh = $po->fresh(['items']);
        $this->assertSame('ordered', $fresh->status);
        $this->assertNull($fresh->actual_delivery_date);
        foreach ($fresh->items as $line) {
            $this->assertSame(0.0, (float) $line->received_quantity);
            $this->assertSame('pending', $line->receive_status);
        }
    }

    public function test_and_then_it_can_be_edited_cancelled_or_deleted(): void
    {
        // The whole reason this exists. Before the undo all three are refused;
        // after it, the order is a piece of paper again.
        $po = $this->receivedOrder();

        $before = $this->getJson("/api/purchases/{$po->id}")->assertOk()->json('purchase');
        $this->assertFalse($before['can_edit']);
        $this->assertFalse($before['can_delete']);
        $this->assertTrue($before['can_undo_receipt']);

        $this->undo($po)->assertOk();

        $after = $this->getJson("/api/purchases/{$po->id}")->assertOk()->json('purchase');
        $this->assertTrue($after['can_edit']);
        $this->assertTrue($after['can_cancel']);

        // Editing a line really works now, not just the flag.
        $this->patchJson("/api/purchases/{$po->id}", [
            'items' => [[
                'inventory_item_id' => (int) $po->items->first()->inventory_item_id,
                'quantity' => 4,
                'unit_cost' => 25,
            ]],
        ])->assertOk();

        $this->assertSame(4.0, (float) $po->fresh(['items'])->items->first()->quantity);
    }

    public function test_the_money_leaves_the_reports_with_the_delivery(): void
    {
        /*
         * Spend is measured by what arrived. Once nothing has arrived, the
         * order costs nothing — which is exactly right when the receipt was
         * entered in error.
         */
        $po = $this->receivedOrder();
        $from = now()->subDays(7)->toDateString();
        $to = now()->addDay()->toDateString();

        $spend = fn () => (float) $this->getJson("/api/reports/finance/spend-hub?from={$from}&to={$to}")
            ->assertOk()->json('totals.purchases');

        $this->assertGreaterThan(0, $spend());

        $this->undo($po)->assertOk();

        $this->assertEqualsWithDelta(0.0, $spend(), 0.01);
    }

    public function test_the_prices_that_delivery_recorded_are_removed(): void
    {
        // A price nobody paid should not steer the next brand comparison.
        $po = $this->receivedOrder();
        $this->assertGreaterThan(0, SupplierPriceHistory::where('purchase_id', $po->id)->count());

        $this->undo($po)->assertOk();

        $this->assertSame(0, SupplierPriceHistory::where('purchase_id', $po->id)->count());
    }

    public function test_the_input_tax_comes_off_when_the_period_is_still_open(): void
    {
        $po = $this->receivedOrder();
        $entry = TaxLedgerEntry::where('source_type', 'purchase')->where('source_id', $po->id)->first();

        if ($entry === null) {
            $this->markTestSkipped('GST is not configured in this fixture, so nothing was posted.');
        }

        $this->undo($po)->assertOk();

        $this->assertSame(0, TaxLedgerEntry::where('source_type', 'purchase')
            ->where('source_id', $po->id)->count());
    }

    public function test_a_filed_gst_period_keeps_its_input_tax_and_says_so(): void
    {
        /*
         * Removing tax from a return already sent to MIRA would falsify it.
         * The undo still goes through — the admin is never stuck — but the
         * entry stays and the answer says why.
         */
        $po = $this->receivedOrder();
        $entry = TaxLedgerEntry::where('source_type', 'purchase')->where('source_id', $po->id)->first();

        if ($entry === null) {
            $this->markTestSkipped('GST is not configured in this fixture, so nothing was posted.');
        }

        app(GstPeriodService::class)->lock((string) $entry->period_key, $this->makeOwner()->id);

        $warnings = $this->undo($po)->assertOk()->json('warnings');

        $this->assertSame(1, TaxLedgerEntry::where('source_type', 'purchase')
            ->where('source_id', $po->id)->count());
        $this->assertNotEmpty(array_filter($warnings, fn ($w) => str_contains($w, 'already filed')));
    }

    public function test_stock_already_used_is_reported_rather_than_hidden(): void
    {
        /*
         * Six of the ten sacks are already cooked. Taking all ten back off is
         * still the truthful move — this order no longer claims to have
         * delivered them — but the count is now wrong in a way only a physical
         * count can settle, so it says so.
         */
        $rice = $this->rice();
        $po = $this->receivedOrder($rice);
        $rice->update(['current_stock' => 4]);

        $warnings = $this->undo($po)->assertOk()->json('warnings');

        $this->assertSame(-6.0, (float) $rice->fresh()->current_stock);
        $this->assertNotEmpty(array_filter($warnings, fn ($w) => str_contains($w, 'stock count')));
    }

    public function test_undoing_twice_does_not_take_the_stock_off_twice(): void
    {
        // A double click, or a retried request on a bad connection.
        $rice = $this->rice();
        $po = $this->receivedOrder($rice);

        $this->undo($po)->assertOk();
        $this->undo($po)->assertStatus(422);

        $this->assertSame(0.0, (float) $rice->fresh()->current_stock);
    }

    public function test_there_is_nothing_to_undo_on_an_order_that_never_arrived(): void
    {
        $res = $this->postJson('/api/purchases', [
            'supplier_id' => Supplier::firstOrCreate(['name' => 'Fahi Store'], ['is_active' => true])->id,
            'purchase_date' => now()->toDateString(),
            'status' => 'draft',
            'items' => [['inventory_item_id' => $this->rice()->id, 'quantity' => 10, 'unit_cost' => 20]],
        ])->assertCreated();

        $this->postJson("/api/purchases/{$res->json('purchase.id')}/undo-receipt", ['reason' => 'x'])
            ->assertStatus(422);
    }

    public function test_it_will_not_happen_without_a_reason(): void
    {
        // The reason is the whole audit value of the act.
        $po = $this->receivedOrder();

        $this->postJson("/api/purchases/{$po->id}/undo-receipt", [])->assertStatus(422);
        $this->postJson("/api/purchases/{$po->id}/undo-receipt", ['reason' => ''])->assertStatus(422);

        $this->assertSame('received', $po->fresh()->status);
    }

    public function test_who_undid_it_and_why_is_recorded(): void
    {
        $po = $this->receivedOrder();
        $this->undo($po, 'Counted into the wrong PO')->assertOk();

        $log = AuditLog::where('action', 'purchase.receipt_undone')
            ->where('model_type', 'Purchase')
            ->where('model_id', $po->id)
            ->first();

        $this->assertNotNull($log);
        $this->assertSame('Counted into the wrong PO', $log->meta['reason']);
        $this->assertSame('received', $log->old_values['status']);
        $this->assertSame('ordered', $log->new_values['status']);
    }

    public function test_it_needs_the_same_permission_as_cancelling(): void
    {
        $po = $this->receivedOrder();

        $outsider = $this->makeStaff('staff');
        $outsider->revokePermission('suppliers.purchases');
        $outsider->unsetRelation('permissions');
        Sanctum::actingAs($outsider, ['staff']);

        $this->postJson("/api/purchases/{$po->id}/undo-receipt", ['reason' => 'nope'])->assertForbidden();

        $this->assertSame('received', $po->fresh()->status);
    }
}
