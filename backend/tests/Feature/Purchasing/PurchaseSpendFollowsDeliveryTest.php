<?php

declare(strict_types=1);

namespace Tests\Feature\Purchasing;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Reporting\Support\PurchaseSpendQuery;
use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Purchase spend is worth what arrived, not what was ordered.
 *
 * Owner, 2026-09-06: "So now will that amount will be deducted in the total
 * expense if the po is cancelled?" The honest answer at the time was yes, and
 * wrongly — twice over:
 *
 *   - An order for ten sacks that delivered four was counted at the full ten.
 *     MVR 200 of cost against MVR 80 of money.
 *   - Short-closing the rest — cancelling the undelivered balance, which the
 *     new Cancel button makes easy — dropped the order out of the
 *     `status IN ('received','partial')` filter every money report used, and
 *     the four sacks' MVR 80 vanished while the sacks stayed on the shelf.
 *
 * Both came from reading the status as if it said how much arrived. It never
 * did. The lines do: `received_quantity × unit_cost`. These tests pin that
 * down end to end, because it is the sort of thing a future filter would
 * quietly undo.
 */
class PurchaseSpendFollowsDeliveryTest extends TestCase
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
        return InventoryItem::firstOrCreate(['sku' => 'RICE-1'], [
            'name' => 'Rice',
            'unit' => 'kg',
            'current_stock' => 0,
            'unit_cost' => 0,
            'is_active' => true,
        ]);
    }

    private function supplier(): Supplier
    {
        return Supplier::firstOrCreate(['name' => 'Fahi Store'], ['is_active' => true]);
    }

    /** Ten sacks at MVR 20 — a MVR 200 order. */
    private function draft(): Purchase
    {
        $res = $this->postJson('/api/purchases', [
            'supplier_id' => $this->supplier()->id,
            'purchase_date' => now()->toDateString(),
            'status' => 'draft',
            'items' => [[
                'inventory_item_id' => $this->rice()->id,
                'quantity' => 10,
                'unit_cost' => 20,
            ]],
        ])->assertCreated();

        return Purchase::with('items')->findOrFail((int) $res->json('purchase.id'));
    }

    private function approve(Purchase $po): void
    {
        $this->postJson("/api/purchases/{$po->id}/approve")->assertOk();
    }

    private function receive(Purchase $po, float $qty): void
    {
        $this->postJson("/api/purchases/{$po->id}/receive", [
            'items' => $po->fresh()->load('items')->items
                ->map(fn ($i) => ['purchase_item_id' => $i->id, 'received_quantity' => $qty])
                ->all(),
        ])->assertOk();
    }

    private function window(): array
    {
        return [now()->subDays(7)->toDateString(), now()->addDay()->toDateString()];
    }

    private function spendHubTotal(): float
    {
        [$from, $to] = $this->window();

        return (float) $this->getJson("/api/reports/finance/spend-hub?from={$from}&to={$to}")
            ->assertOk()
            ->json('totals.purchases');
    }

    private function cogsExGst(): float
    {
        [$from, $to] = $this->window();

        return PurchaseSpendQuery::total($from, $to);
    }

    public function test_a_part_delivery_costs_what_came_off_the_van(): void
    {
        // Four of ten sacks at MVR 20. The order says 200; the money says 80,
        // and the money is what a cost report is for.
        $po = $this->draft();
        $this->approve($po);
        $this->receive($po, 4);

        $this->assertSame('partial', $po->fresh()->status);
        $this->assertEqualsWithDelta(80.0, $this->cogsExGst(), 0.01);
    }

    public function test_short_closing_the_balance_keeps_the_money_that_was_spent(): void
    {
        /*
         * The owner's question, exactly. Cancelling the undelivered six sacks
         * is a statement about the six, not about the four already in the
         * store — so the figure must not move.
         */
        $po = $this->draft();
        $this->approve($po);
        $this->receive($po, 4);

        $before = $this->cogsExGst();
        $this->postJson("/api/purchases/{$po->id}/cancel", [
            'reason' => 'Supplier had no more stock',
        ])->assertOk();

        $this->assertSame('cancelled', $po->fresh()->status);
        $this->assertEqualsWithDelta($before, $this->cogsExGst(), 0.01);
        $this->assertEqualsWithDelta(80.0, $this->cogsExGst(), 0.01);
    }

    public function test_a_full_receipt_is_still_worth_the_whole_order(): void
    {
        // The case that always worked has to keep working: the new measure
        // agrees with the old one whenever the old one was right.
        $po = $this->draft();
        $this->approve($po);
        $this->receive($po, 10);

        $this->assertSame('received', $po->fresh()->status);
        $this->assertEqualsWithDelta(200.0, $this->cogsExGst(), 0.01);
        $this->assertEqualsWithDelta((float) $po->fresh()->subtotal, $this->cogsExGst(), 0.01);
    }

    public function test_an_order_nobody_has_received_is_worth_nothing(): void
    {
        // Draft and approved-but-undelivered are both plans. Ordering does not
        // spend money; taking delivery does.
        $po = $this->draft();
        $this->assertEqualsWithDelta(0.0, $this->cogsExGst(), 0.01);

        $this->approve($po);
        $this->assertEqualsWithDelta(0.0, $this->cogsExGst(), 0.01);

        $this->postJson("/api/purchases/{$po->id}/cancel", ['reason' => 'Ordered twice'])->assertOk();
        $this->assertEqualsWithDelta(0.0, $this->cogsExGst(), 0.01);
    }

    public function test_a_deleted_order_takes_its_money_with_it(): void
    {
        /*
         * Only orders nothing arrived against can be deleted, so this is
         * really a guard on the reverse: the raw joins the reports use carry
         * no soft-delete scope, and a deleted row would otherwise keep
         * appearing in the totals with nothing on screen to explain it.
         */
        $po = $this->draft();
        $this->deleteJson("/api/purchases/{$po->id}")->assertOk();

        $this->assertEqualsWithDelta(0.0, $this->cogsExGst(), 0.01);
        $this->assertEqualsWithDelta(0.0, $this->spendHubTotal(), 0.01);
    }

    public function test_the_spend_hub_shows_exactly_what_was_paid(): void
    {
        /*
         * Owner, 2026-09-06: "gst not return in cafe." The price typed on the
         * line is the money handed over — an earlier version multiplied it by
         * the GST rate for a "with GST" view, inventing 8% of spend that
         * nobody ever paid.
         */
        $po = $this->draft();
        $this->approve($po);
        $this->receive($po, 4);

        $this->assertEqualsWithDelta(80.0, $this->spendHubTotal(), 0.01);
    }

    public function test_the_supplier_only_gets_credit_for_what_it_delivered(): void
    {
        // Supplier spend used to sum every order raised against them, drafts
        // included. A supplier that quoted and never delivered was the best
        // customer in the list.
        $po = $this->draft();
        $supplierId = (int) $po->supplier_id;

        $this->postJson("/api/suppliers/{$supplierId}/performance/refresh")->assertOk();
        $this->assertEqualsWithDelta(0.0, (float) \App\Models\SupplierPerformanceCache::where(
            'supplier_id',
            $supplierId,
        )->value('total_spend'), 0.01);

        $this->approve($po);
        $this->receive($po, 4);

        $this->postJson("/api/suppliers/{$supplierId}/performance/refresh")->assertOk();
        $spend = (float) \App\Models\SupplierPerformanceCache::where('supplier_id', $supplierId)
            ->value('total_spend');

        // Exactly the money handed over for the four sacks — no GST arithmetic.
        $this->assertEqualsWithDelta(80.0, $spend, 0.01);
    }

    public function test_a_new_order_can_still_be_numbered_after_one_is_deleted(): void
    {
        /*
         * `purchase_number` is unique in the database and a soft-deleted row
         * still holds its number there, while the model's default scope hides
         * it — so the generator has to look past the scope or the next order
         * of the day collides and the save fails.
         */
        $first = $this->draft();
        $this->deleteJson("/api/purchases/{$first->id}")->assertOk();

        $second = $this->draft();

        $this->assertNotSame($first->purchase_number, $second->purchase_number);
    }
}
