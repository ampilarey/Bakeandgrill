<?php

declare(strict_types=1);

namespace Tests\Feature\Payment;

use App\Domains\Payments\Services\PaymentCommissionService;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A commission we paid stays paid when the order is refunded.
 *
 * The bank takes its cut when the card clears and does not hand it back
 * because we later refunded the customer, so the cost is real and
 * PaymentCommissionExpenseService books it as an expense. The summary used to
 * filter on sale statuses, which drop refunded orders — so the two views of
 * "what does card processing cost us" disagreed by every refunded order, with
 * the summary understating.
 *
 * If BML turns out to reverse its fee on refund, the answer is to reverse the
 * booked expense too, not to hide the row from the summary.
 */
class CommissionAfterRefundTest extends TestCase
{
    use RefreshDatabase;

    private function paidOrderWithCardPayment(string $orderStatus, string $number): Order
    {
        $order = Order::factory()->create([
            'order_number' => $number,
            'status' => $orderStatus,
            'payment_status' => 'paid',
            'total' => 100,
            'total_laar' => 10000,
        ]);

        $payment = Payment::create([
            'idempotency_key' => 'comm:' . $number,
            'order_id' => $order->id,
            'method' => 'card',
            'currency' => 'MVR',
            'amount' => 100,
            'amount_laar' => 10000,
            'status' => 'confirmed',
            'processed_at' => now(),
        ]);

        app(PaymentCommissionService::class)->applyToPayment($payment);

        return $order;
    }

    public function test_a_refunded_order_keeps_its_commission_in_the_summary(): void
    {
        // THE test. MVR 100 on card at 2.5% → MVR 2.50 the bank kept. The
        // order is refunded; the cost did not go away.
        $this->paidOrderWithCardPayment('refunded', 'CARD-REFUNDED');

        $summary = app(PaymentCommissionService::class)->paymentCommissionSummary(
            now()->subDay(),
            now()->addDay(),
        );

        $this->assertSame(2.5, (float) $summary['totals']['commission_total']);
        $this->assertSame(100.0, (float) $summary['totals']['gross_commissionable']);
    }

    public function test_a_partially_refunded_order_keeps_its_commission(): void
    {
        $this->paidOrderWithCardPayment('partially_refunded', 'CARD-PARTIAL');

        $summary = app(PaymentCommissionService::class)->paymentCommissionSummary(
            now()->subDay(),
            now()->addDay(),
        );

        $this->assertSame(2.5, (float) $summary['totals']['commission_total']);
    }

    public function test_a_cancelled_order_is_still_excluded(): void
    {
        // Cancelled before settlement is not a sale and not a cost — the
        // filter must not become "everything".
        $this->paidOrderWithCardPayment('cancelled', 'CARD-CANCELLED');

        $summary = app(PaymentCommissionService::class)->paymentCommissionSummary(
            now()->subDay(),
            now()->addDay(),
        );

        $this->assertSame(0.0, (float) $summary['totals']['commission_total']);
    }

    public function test_a_stripe_payment_accrues_commission(): void
    {
        // Stripe resolved to no channel at all, so its cost was invisible —
        // no commission, no expense — the day Stripe was switched on.
        $order = Order::factory()->create([
            'order_number' => 'STRIPE-1',
            'status' => 'completed',
            'payment_status' => 'paid',
            'total' => 100,
            'total_laar' => 10000,
        ]);

        $payment = Payment::create([
            'idempotency_key' => 'comm:stripe-1',
            'order_id' => $order->id,
            'method' => 'stripe',
            'currency' => 'MVR',
            'amount' => 100,
            'amount_laar' => 10000,
            'status' => 'confirmed',
            'processed_at' => now(),
        ]);

        app(PaymentCommissionService::class)->applyToPayment($payment);

        $this->assertSame(
            PaymentCommissionService::CHANNEL_ONLINE_GATEWAY,
            $payment->fresh()->commission_channel,
        );
        $this->assertSame(250, (int) $payment->fresh()->commission_laar);
    }
}
