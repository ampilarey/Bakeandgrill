<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Refund;
use App\Models\Shift;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A refund takes its cash out of the drawer that is open when it is APPROVED,
 * not the one that was open when it was requested.
 *
 * The OTP / dual-approval workflow makes overnight pendings ordinary: a
 * cashier requests on Monday, a manager approves on Tuesday, and the money
 * leaves Tuesday's till. Expected cash used to reduce Monday's drawer for it,
 * so Tuesday's cashier counted short for a payout they could not account for —
 * and Monday's already-signed-off record moved underneath them.
 *
 * These tests drive `expectedCashFor` through the summary endpoint rather than
 * asserting on the column, because the column is only a means: what matters is
 * the number the cashier is judged against.
 */
class RefundDrawerShiftAttributionTest extends TestCase
{
    use RefreshDatabase;

    private function shiftFor(float $openingCash = 100.0, bool $closed = false): Shift
    {
        return Shift::create([
            'user_id' => \App\Models\User::factory()->create()->id,
            'opening_cash' => $openingCash,
            'opened_at' => now()->subHours($closed ? 20 : 1),
            'closed_at' => $closed ? now()->subHours(12) : null,
            'expected_cash' => $openingCash,
            'closing_cash' => $openingCash,
            'variance' => 0,
        ]);
    }

    private function refund(Order $order, int $requestShiftId, ?int $drawerShiftId, string $status): Refund
    {
        return Refund::create([
            'order_id' => $order->id,
            'shift_id' => $requestShiftId,
            'drawer_shift_id' => $drawerShiftId,
            'amount' => 25.00,
            'drawer_cash_out_laar' => 2500,
            'status' => $status,
            'reason' => 'Test refund',
            'requested_at' => now(),
        ]);
    }

    private function expectedCashLaarFor(Shift $shift): int
    {
        $controller = new \App\Http\Controllers\Api\ShiftController;
        $method = new \ReflectionMethod($controller, 'expectedCashFor');
        $method->setAccessible(true);

        return (int) round(((float) $method->invoke($controller, $shift)['expected']) * 100);
    }

    public function test_the_approving_shift_is_the_one_that_pays_out(): void
    {
        // THE test. Requested in the closed shift, approved in the open one:
        // the open drawer is the one that is down MVR 25.
        $order = Order::factory()->create(['total' => 100, 'total_laar' => 10000]);
        $monday = $this->shiftFor(100.0, closed: true);
        $tuesday = $this->shiftFor(100.0);

        $this->refund($order, requestShiftId: $monday->id, drawerShiftId: $tuesday->id, status: 'approved');

        $this->assertSame(7500, $this->expectedCashLaarFor($tuesday), 'approving drawer pays');
        $this->assertSame(10000, $this->expectedCashLaarFor($monday), 'requesting drawer untouched');
    }

    public function test_a_refund_requested_and_approved_in_one_shift_still_hits_that_shift(): void
    {
        // The ordinary counter case — owner request+approve in one action.
        // Nothing about this should have moved.
        $order = Order::factory()->create(['total' => 100, 'total_laar' => 10000]);
        $shift = $this->shiftFor();

        $this->refund($order, requestShiftId: $shift->id, drawerShiftId: $shift->id, status: 'approved');

        $this->assertSame(7500, $this->expectedCashLaarFor($shift));
    }

    public function test_a_legacy_refund_with_no_drawer_shift_falls_back_to_the_requesting_shift(): void
    {
        // Every refund approved before drawer_shift_id existed has NULL there.
        // History must not move: those still belong to the requesting shift.
        $order = Order::factory()->create(['total' => 100, 'total_laar' => 10000]);
        $shift = $this->shiftFor();

        $this->refund($order, requestShiftId: $shift->id, drawerShiftId: null, status: 'approved');

        $this->assertSame(7500, $this->expectedCashLaarFor($shift));
    }

    public function test_a_pending_refund_empties_no_drawer(): void
    {
        // Requested but not authorised — no money has moved yet, in either
        // shift. This is what makes overnight pendings safe.
        $order = Order::factory()->create(['total' => 100, 'total_laar' => 10000]);
        $monday = $this->shiftFor(100.0, closed: true);
        $tuesday = $this->shiftFor(100.0);

        $this->refund($order, requestShiftId: $monday->id, drawerShiftId: null, status: 'pending');

        $this->assertSame(10000, $this->expectedCashLaarFor($monday));
        $this->assertSame(10000, $this->expectedCashLaarFor($tuesday));
    }

    public function test_a_closed_shift_reports_the_figure_it_was_closed_on(): void
    {
        // Recomputing a closed shift live let anything that landed afterwards
        // move the expected cash of a drawer that had already been counted and
        // signed off — the summary and the stored variance then disagreed
        // about a shift nobody could still change.
        $order = Order::factory()->create(['total' => 100, 'total_laar' => 10000]);
        $closed = $this->shiftFor(100.0, closed: true);

        // A legacy-style refund landing on the closed shift after the fact.
        $this->refund($order, requestShiftId: $closed->id, drawerShiftId: null, status: 'approved');

        $owner = \App\Models\User::find($closed->user_id);
        $ownerRole = \App\Models\Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'is_active' => true],
        );
        \App\Domains\Permissions\PermissionCatalogSync::sync();
        $owner->update(['role_id' => $ownerRole->id]);

        \Laravel\Sanctum\Sanctum::actingAs($owner->fresh(), ['staff']);
        $response = $this->getJson("/api/shifts/{$closed->id}/summary");

        $response->assertOk();
        $this->assertSame(
            100.0,
            (float) $response->json('cash_drawer.expected_cash'),
            'the stored close figure stands, not a live recomputation',
        );
    }

    public function test_a_rejected_refund_empties_no_drawer(): void
    {
        $order = Order::factory()->create(['total' => 100, 'total_laar' => 10000]);
        $shift = $this->shiftFor();

        $this->refund($order, requestShiftId: $shift->id, drawerShiftId: $shift->id, status: 'rejected');

        $this->assertSame(10000, $this->expectedCashLaarFor($shift));
    }
}
