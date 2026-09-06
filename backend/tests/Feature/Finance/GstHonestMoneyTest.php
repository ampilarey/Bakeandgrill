<?php

declare(strict_types=1);

namespace Tests\Feature\Finance;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Purchase;
use App\Models\Supplier;
use App\Models\TaxLedgerEntry;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Money the café actually keeps, and money it actually spends.
 *
 * Owner, 2026-09-06: "gst not return in cafe" — the café remits the GST it
 * collects on sales and never gets input tax back on purchases. Two figures
 * were lying about that:
 *
 *   - The P&L computed profit on GST-INCLUSIVE revenue. The 8% collected for
 *     MIRA was displayed as a line and never subtracted, so every profit
 *     figure was inflated by tax the shop merely holds in passing.
 *   - Spend figures multiplied the entered purchase price by the GST rate for
 *     a "with GST" view — but the typed price IS the money handed over, so
 *     that invented 8% of spend nobody paid.
 *
 * The rule now: income is what the shop keeps, cost is what it hands over.
 * No tax arithmetic on either side beyond subtracting the output GST it
 * collects for the state.
 */
class GstHonestMoneyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    /** One paid order: MVR $food of food + 8% output GST on top. */
    private function paidOrder(float $food): Order
    {
        $order = Order::factory()->create([
            'status' => 'completed',
            'payment_status' => 'paid',
            'subtotal' => $food,
            'subtotal_laar' => (int) round($food * 100),
            'tax_amount' => round($food * 0.08, 2),
            'tax_laar' => (int) round($food * 8),
            'total' => round($food * 1.08, 2),
            'total_laar' => (int) round($food * 108),
            'created_at' => Carbon::now(),
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => \App\Models\Item::factory()->create(['base_price' => $food])->id,
            'item_name' => 'Roshi',
            'quantity' => 1,
            'unit_price' => $food,
            'total_price' => $food,
        ]);

        return $order;
    }

    private function rice(): InventoryItem
    {
        return InventoryItem::firstOrCreate(['sku' => 'RICE-1'], [
            'name' => 'Rice', 'unit' => 'kg', 'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true,
        ]);
    }

    private function receivedOrder(float $qty = 10, float $unitCost = 20): Purchase
    {
        $res = $this->postJson('/api/purchases', [
            'supplier_id' => Supplier::firstOrCreate(['name' => 'Fahi Store'], ['is_active' => true])->id,
            'purchase_date' => now()->toDateString(),
            'status' => 'draft',
            'items' => [['inventory_item_id' => $this->rice()->id, 'quantity' => $qty, 'unit_cost' => $unitCost]],
        ])->assertCreated();

        $po = Purchase::with('items')->findOrFail((int) $res->json('purchase.id'));
        $this->postJson("/api/purchases/{$po->id}/approve")->assertOk();
        $this->postJson("/api/purchases/{$po->id}/receive", [
            'items' => $po->items->map(fn ($i) => [
                'purchase_item_id' => $i->id, 'received_quantity' => $qty,
            ])->all(),
        ])->assertOk();

        return $po->fresh(['items']);
    }

    private function pnl(): array
    {
        $from = now()->subDays(7)->toDateString();
        $to = now()->addDay()->toDateString();

        return $this->getJson("/api/reports/finance/profit-and-loss?from={$from}&to={$to}")
            ->assertOk()
            ->json();
    }

    public function test_profit_is_computed_on_what_the_shop_keeps_not_what_it_collects(): void
    {
        /*
         * MVR 1000 of food bills MVR 1080. The 80 belongs to MIRA — profit on
         * a day with no costs is 1000, and was 1080 until today.
         */
        $this->paidOrder(1000);

        $pnl = $this->pnl();

        $this->assertEqualsWithDelta(1080.0, $pnl['revenue']['gross'], 0.01);
        $this->assertEqualsWithDelta(80.0, $pnl['revenue']['tax'], 0.01);
        $this->assertEqualsWithDelta(1000.0, $pnl['revenue']['net'], 0.01);
        $this->assertEqualsWithDelta(1000.0, $pnl['gross_profit'], 0.01);
    }

    public function test_purchase_cost_is_exactly_the_money_handed_over(): void
    {
        // 10 kg at MVR 20 typed on the line = MVR 200 out of the till. COGS
        // says 200 — no 8% invented on top, none stripped off.
        $this->paidOrder(1000);
        $this->receivedOrder(10, 20);

        $pnl = $this->pnl();

        $this->assertEqualsWithDelta(200.0, $pnl['cogs'], 0.01);
        $this->assertEqualsWithDelta(800.0, $pnl['gross_profit'], 0.01);
    }

    public function test_the_daily_summary_agrees_with_the_pnl(): void
    {
        $this->paidOrder(1000);
        $this->receivedOrder(10, 20);

        $daily = $this->getJson('/api/reports/finance/daily-summary?date=' . now()->toDateString())
            ->assertOk()
            ->json();

        $this->assertEqualsWithDelta(1000.0, (float) $daily['net_revenue'], 0.01);
        $this->assertEqualsWithDelta(800.0, (float) $daily['net_profit'], 0.01);
    }

    public function test_quick_receive_reaches_the_gst_ledger(): void
    {
        /*
         * A purchase entered directly as received (the POS path) stocks in on
         * the spot — but only the workflow receive() ever told the GST ledger,
         * so these purchases were invisible to the tax report.
         */
        $res = $this->postJson('/api/purchases', [
            'supplier_id' => Supplier::firstOrCreate(['name' => 'Fahi Store'], ['is_active' => true])->id,
            'purchase_date' => now()->toDateString(),
            'status' => 'received',
            'gst_laar' => 1600,
            'items' => [['inventory_item_id' => $this->rice()->id, 'quantity' => 10, 'unit_cost' => 20]],
        ])->assertCreated();

        $this->assertSame(1, TaxLedgerEntry::where('source_type', 'purchase')
            ->where('source_id', (int) $res->json('purchase.id'))
            ->count());
    }

    public function test_a_cancelled_order_takes_its_unpaid_invoice_with_it(): void
    {
        /*
         * An invoice raised from a PO used to sit in Accounts Payable forever
         * after the PO was cancelled, still claiming the money was owed.
         */
        $res = $this->postJson('/api/purchases', [
            'supplier_id' => Supplier::firstOrCreate(['name' => 'Fahi Store'], ['is_active' => true])->id,
            'purchase_date' => now()->toDateString(),
            'status' => 'draft',
            'items' => [['inventory_item_id' => $this->rice()->id, 'quantity' => 10, 'unit_cost' => 20]],
        ])->assertCreated();
        $poId = (int) $res->json('purchase.id');

        $this->postJson("/api/invoices/from-purchase/{$poId}")->assertCreated();
        $this->assertSame(1, Invoice::where('purchase_id', $poId)->whereIn('status', ['draft', 'sent'])->count());

        $this->postJson("/api/purchases/{$poId}/cancel", ['reason' => 'Ordered twice'])->assertOk();

        $this->assertSame('void', Invoice::where('purchase_id', $poId)->value('status'));

        // And it is out of accounts payable.
        $ap = $this->getJson('/api/reports/finance/accounts-payable')->assertOk()->json();
        $this->assertEqualsWithDelta(0.0, (float) $ap['total_outstanding'], 0.01);
    }

    public function test_a_short_closed_order_keeps_its_invoice_but_says_so(): void
    {
        // Part of the delivery is real, so part of the debt may be too. That
        // is a conversation with the supplier, not an automatic void.
        $po = Purchase::with('items')->findOrFail((int) $this->postJson('/api/purchases', [
            'supplier_id' => Supplier::firstOrCreate(['name' => 'Fahi Store'], ['is_active' => true])->id,
            'purchase_date' => now()->toDateString(),
            'status' => 'draft',
            'items' => [['inventory_item_id' => $this->rice()->id, 'quantity' => 10, 'unit_cost' => 20]],
        ])->assertCreated()->json('purchase.id'));
        $this->postJson("/api/purchases/{$po->id}/approve")->assertOk();
        $this->postJson("/api/purchases/{$po->id}/receive", [
            'items' => $po->items->map(fn ($i) => [
                'purchase_item_id' => $i->id, 'received_quantity' => 4,
            ])->all(),
        ])->assertOk();
        $this->postJson("/api/invoices/from-purchase/{$po->id}")->assertCreated();

        $warnings = $this->postJson("/api/purchases/{$po->id}/cancel", ['reason' => 'No more stock'])
            ->assertOk()
            ->json('warnings');

        $this->assertNotSame('void', Invoice::where('purchase_id', $po->id)->value('status'));
        $this->assertNotEmpty(array_filter($warnings, fn ($w) => str_contains($w, 'Invoice')));
    }

    public function test_undoing_a_short_closed_order_does_not_resurrect_it(): void
    {
        // The cancel was a decision; undoing the receipt reverses the goods,
        // not the decision. And with nothing received left, delete opens up.
        $po = Purchase::with('items')->findOrFail((int) $this->postJson('/api/purchases', [
            'supplier_id' => Supplier::firstOrCreate(['name' => 'Fahi Store'], ['is_active' => true])->id,
            'purchase_date' => now()->toDateString(),
            'status' => 'draft',
            'items' => [['inventory_item_id' => $this->rice()->id, 'quantity' => 10, 'unit_cost' => 20]],
        ])->assertCreated()->json('purchase.id'));
        $this->postJson("/api/purchases/{$po->id}/approve")->assertOk();
        $this->postJson("/api/purchases/{$po->id}/receive", [
            'items' => $po->items->map(fn ($i) => [
                'purchase_item_id' => $i->id, 'received_quantity' => 4,
            ])->all(),
        ])->assertOk();
        $this->postJson("/api/purchases/{$po->id}/cancel", ['reason' => 'Short close'])->assertOk();

        $this->postJson("/api/purchases/{$po->id}/undo-receipt", ['reason' => 'Never arrived'])->assertOk();

        $fresh = $this->getJson("/api/purchases/{$po->id}")->assertOk()->json('purchase');
        $this->assertSame('cancelled', $fresh['status']);
        $this->assertTrue($fresh['can_delete']);
    }
}
