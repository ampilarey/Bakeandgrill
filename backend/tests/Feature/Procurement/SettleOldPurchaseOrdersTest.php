<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Console\Commands\SettleOldPurchaseOrders;
use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Owner, 2026-09-21: "Why i see owed to suppliers in suppliers page."
 *
 * Because payment tracking started every order that already existed at
 * nothing paid. This settles those, and only those, and only when asked
 * twice.
 */
class SettleOldPurchaseOrdersTest extends TestCase
{
    use RefreshDatabase;

    private function order(string $number, float $total, string $date, string $status = 'received', float $paid = 0): Purchase
    {
        $item = InventoryItem::firstOrCreate(['name' => 'Flour'], ['unit' => 'kg', 'unit_cost' => 10, 'is_active' => true]);
        $po = Purchase::create([
            'purchase_number' => $number,
            'supplier_id' => Supplier::firstOrCreate(['name' => 'Agora'])->id,
            'purchase_date' => $date,
            'status' => $status,
            'subtotal' => $total,
            'total' => $total,
            'paid_amount' => $paid,
        ]);
        PurchaseItem::create(['purchase_id' => $po->id, 'inventory_item_id' => $item->id, 'quantity' => 1, 'unit_cost' => $total, 'total_cost' => $total]);

        return $po;
    }

    public function test_it_changes_nothing_until_it_is_asked_twice(): void
    {
        $old = $this->order('PO-1', 300, '2026-09-01');

        $this->artisan('purchasing:settle-old-orders')
            ->expectsOutputToContain('Orders placed before 2026-09-21')
            ->expectsOutputToContain('Nothing has been changed.')
            ->assertSuccessful();

        $this->assertSame('0.00', (string) $old->fresh()->paid_amount);
        $this->assertSame('unpaid', $old->fresh()->payment_status);
    }

    public function test_applying_settles_the_old_orders_and_leaves_the_new_ones_alone(): void
    {
        $old = $this->order('PO-1', 300, '2026-09-01');
        $alsoOld = $this->order('PO-2', 120, '2026-09-20');
        $new = $this->order('PO-3', 500, '2026-09-21');
        $later = $this->order('PO-4', 90, '2026-09-25');

        $this->artisan('purchasing:settle-old-orders --apply')
            ->expectsOutputToContain('Settled 2 order(s)')
            ->assertSuccessful();

        foreach ([$old, $alsoOld] as $settled) {
            $settled->refresh();
            $this->assertSame('paid', $settled->payment_status);
            $this->assertSame(0.0, $settled->owed);
            // Not a payment made today: the order's own date, and a method
            // that says where the figure came from.
            $this->assertSame($settled->purchase_date->toDateString(), $settled->paid_at->toDateString());
            $this->assertSame(SettleOldPurchaseOrders::METHOD, $settled->payment_method);
            $this->assertSame(SettleOldPurchaseOrders::REFERENCE, $settled->payment_ref);
        }

        foreach ([$new, $later] as $untouched) {
            $this->assertSame('unpaid', $untouched->fresh()->payment_status);
            $this->assertNull($untouched->fresh()->payment_method);
        }
    }

    public function test_an_order_that_is_really_still_owed_can_be_kept_out_of_it(): void
    {
        $settle = $this->order('PO-1', 300, '2026-09-01');
        $keep = $this->order('PO-2', 450, '2026-09-02');

        // By the order number, which is what the list and the screen show.
        $this->artisan("purchasing:settle-old-orders --apply --except={$keep->purchase_number}")
            ->expectsOutputToContain('Settled 1 order(s)')
            ->assertSuccessful();

        $this->assertSame('paid', $settle->fresh()->payment_status);
        $this->assertSame('unpaid', $keep->fresh()->payment_status);
        $this->assertSame(450.0, $keep->fresh()->owed);

        // An id still works for anyone who has one.
        $this->artisan("purchasing:settle-old-orders --apply --except={$keep->id}")
            ->expectsOutputToContain('Nothing owing on orders placed before')
            ->assertSuccessful();
        $this->assertSame('unpaid', $keep->fresh()->payment_status);
    }

    public function test_a_part_paid_order_is_finished_off_rather_than_double_counted(): void
    {
        $part = $this->order('PO-1', 300, '2026-09-01', 'received', 100);

        $this->artisan('purchasing:settle-old-orders --apply')->assertSuccessful();

        $this->assertSame('300.00', (string) $part->fresh()->paid_amount);
        $this->assertSame(0.0, $part->fresh()->owed);
    }

    public function test_drafts_and_cancelled_orders_are_never_touched(): void
    {
        $draft = $this->order('PO-1', 300, '2026-09-01', 'draft');
        $cancelled = $this->order('PO-2', 200, '2026-09-02', 'cancelled');

        $this->artisan('purchasing:settle-old-orders')
            ->expectsOutputToContain('Nothing owing on orders placed before')
            ->assertSuccessful();

        $this->assertSame('0.00', (string) $draft->fresh()->paid_amount);
        $this->assertSame('0.00', (string) $cancelled->fresh()->paid_amount);
    }

    public function test_a_different_cut_off_can_be_given_and_a_bad_one_is_refused(): void
    {
        $this->order('PO-1', 300, '2026-08-01');
        $this->order('PO-2', 120, '2026-09-10');

        $this->artisan('purchasing:settle-old-orders --before=2026-09-01 --apply')
            ->expectsOutputToContain('Settled 1 order(s)')
            ->assertSuccessful();

        $this->artisan('purchasing:settle-old-orders --before=whenever')
            ->expectsOutputToContain('Could not read a date')
            ->assertFailed();
    }
}
