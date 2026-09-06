<?php

declare(strict_types=1);

namespace Tests\Feature\Purchasing;

use App\Domains\Finance\Services\NonStockPurchaseExpenseService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Expense;
use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\SiteSetting;
use App\Models\Supplier;
use App\Models\TaxLedgerEntry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Deleting a purchase order moves no money.
 *
 * Owner, 2026-09-06: "What will happen to the money if po is deleted? Will
 * that deduct from the expense?"
 *
 * It does not, and the reason is worth stating rather than leaving to be
 * rediscovered: **a purchase order only becomes money when something is
 * received against it**, and PurchaseEditPolicy refuses to delete anything
 * that received a thing. So a deletable order was never in a single figure —
 * there is no subtraction to make, because there was no addition.
 *
 * Three separate paths turn a purchase into money, and all three are gated on
 * the same receipt:
 *
 *   - COGS, cash flow, the daily summary and the spend hub count only
 *     `received` and `partial` orders. A draft is a plan, not a spend.
 *   - The optional non-stock auto-expense sums `received_quantity`, so a
 *     draft produces nothing to orphan.
 *   - Input GST is posted from receive() alone.
 *
 * These tests hold that gate. They are here because the safety is currently a
 * consequence of every report filtering on status, and a future report that
 * forgot to would break it silently — with an order that costs money after it
 * has been deleted.
 */
class DeletedPurchaseTouchesNoMoneyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    private function rice(): InventoryItem
    {
        return InventoryItem::create([
            'name' => 'Rice',
            'sku' => 'RICE-1',
            'unit' => 'kg',
            'current_stock' => 0,
            'unit_cost' => 0,
            'is_active' => true,
        ]);
    }

    /** @param array<string, mixed> $line */
    private function draft(array $line, float $cost = 200): Purchase
    {
        $res = $this->postJson('/api/purchases', [
            'supplier_id' => Supplier::create(['name' => 'Fahi Store', 'is_active' => true])->id,
            'purchase_date' => now()->toDateString(),
            'status' => 'draft',
            'items' => [$line + ['quantity' => 10, 'unit_cost' => $cost / 10]],
        ])->assertCreated();

        return Purchase::with('items')->findOrFail((int) $res->json('purchase.id'));
    }

    private function spendHubTotal(): float
    {
        $from = now()->subDays(7)->toDateString();
        $to = now()->addDay()->toDateString();

        return (float) $this->getJson("/api/reports/finance/spend-hub?from={$from}&to={$to}")
            ->assertOk()
            ->json('totals.purchases');
    }

    public function test_a_draft_was_never_in_the_spend_figure_to_begin_with(): void
    {
        // The question behind the question: a draft is a plan. Nothing is
        // deducted on delete because nothing was ever added.
        $before = $this->spendHubTotal();
        $po = $this->draft(['inventory_item_id' => $this->rice()->id]);

        $this->assertEqualsWithDelta($before, $this->spendHubTotal(), 0.01);

        $this->deleteJson("/api/purchases/{$po->id}")->assertOk();

        $this->assertEqualsWithDelta($before, $this->spendHubTotal(), 0.01);
    }

    public function test_a_cancelled_order_is_out_of_the_spend_figure_before_and_after(): void
    {
        $po = $this->draft(['inventory_item_id' => $this->rice()->id]);
        $this->postJson("/api/purchases/{$po->id}/cancel", ['reason' => 'Mistake'])->assertOk();

        $before = $this->spendHubTotal();
        $this->deleteJson("/api/purchases/{$po->id}")->assertOk();

        $this->assertEqualsWithDelta($before, $this->spendHubTotal(), 0.01);
    }

    public function test_money_that_was_spent_cannot_be_deleted_away(): void
    {
        /*
         * The other half of the answer. Deleting is not a way to take back a
         * spend — a received order is locked, and the figure stays where it
         * is. Correcting real money is a stock adjustment or an expense edit,
         * not a vanishing document.
         */
        $rice = $this->rice();
        $po = $this->draft(['inventory_item_id' => $rice->id]);
        $this->postJson("/api/purchases/{$po->id}/approve")->assertOk();
        $this->postJson("/api/purchases/{$po->id}/receive", [
            'items' => $po->fresh()->load('items')->items
                ->map(fn ($i) => ['purchase_item_id' => $i->id, 'received_quantity' => (float) $i->quantity])
                ->all(),
        ])->assertOk();

        $spent = $this->spendHubTotal();
        $this->assertGreaterThan(0, $spent);

        $this->deleteJson("/api/purchases/{$po->id}")->assertStatus(422);

        $this->assertEqualsWithDelta($spent, $this->spendHubTotal(), 0.01);
    }

    public function test_a_deletable_order_never_produced_an_auto_expense_to_orphan(): void
    {
        /*
         * The auto-expense is off by default; switched on it still only sums
         * `received_quantity`, so a draft raises nothing. This is the thing
         * that would leave money on the books after a delete if it ever
         * changed, so it is worth holding down.
         */
        SiteSetting::set(NonStockPurchaseExpenseService::SETTING_KEY, '1');
        SiteSetting::bust();

        // A non-stock line — the only kind the auto-expense touches at all.
        $po = $this->draft(['inventory_item_id' => $this->rice()->id]);

        $this->assertSame(0, Expense::where('purchase_id', $po->id)->count());

        $this->deleteJson("/api/purchases/{$po->id}")->assertOk();

        $this->assertSame(0, Expense::where('purchase_id', $po->id)->count());
    }

    public function test_no_gst_input_was_posted_for_an_order_nothing_arrived_against(): void
    {
        // Input tax is claimed on receipt, never on ordering. A deleted draft
        // leaves nothing behind in the GST ledger to unwind.
        $po = $this->draft(['inventory_item_id' => $this->rice()->id]);

        $ledgerRows = fn () => TaxLedgerEntry::where('source_type', 'purchase')
            ->where('source_id', $po->id)
            ->count();

        $this->assertSame(0, $ledgerRows());

        $this->deleteJson("/api/purchases/{$po->id}")->assertOk();

        $this->assertSame(0, $ledgerRows());
    }
}
