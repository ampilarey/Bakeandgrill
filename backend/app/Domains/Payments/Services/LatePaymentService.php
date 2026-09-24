<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Domains\Finance\Services\RefundWorkflowService;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Orders\Support\SystemCancelReasons;
use App\Models\Order;
use App\Models\OrderPromotion;
use App\Models\Payment;
use App\Models\Refund;
use App\Services\AuditLogService;
use App\Services\OnlineOrderingGateService;
use App\Support\OwnerPhones;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * A bank payment that lands on an order the system already cancelled.
 *
 * Checkout audit, 2026-09-26. The unpaid-order cleanup and the bank's
 * confirmation can cross: the order is cancelled at 30 minutes, the
 * confirmation arrives at 31. Before this, the confirmation threw on every
 * retry and the customer was charged for nothing.
 *
 * Bring the order back when nothing about it has been undone that cannot be
 * redone: a pickup or delivery order, cancelled by the cleanup (not by a
 * person), in the last two hours, with no loyalty points on it (their hold
 * was released), and the restaurant still taking orders. The kitchen then
 * sees it like any other paid order.
 *
 * Otherwise take the payment, record an approved refund that is owed back
 * by card (so it appears under Refunds → Owed and in the daily summary),
 * tell the customer it is on its way, and text the owners.
 */
final class LatePaymentService
{
    public const REVIVE_WITHIN_HOURS = 2;

    public function canRevive(Order $order): bool
    {
        if ($order->status !== 'cancelled') {
            return false;
        }
        if (!SystemCancelReasons::isSystem($order->cancellation_reason)) {
            return false;
        }
        if (!in_array($order->type, ['online_pickup', 'delivery'], true)) {
            return false;
        }
        if ((int) ($order->loyalty_discount_laar ?? 0) > 0) {
            return false;
        }
        if ($order->cancelled_at !== null && $order->cancelled_at->lt(now()->subHours(self::REVIVE_WITHIN_HOURS))) {
            return false;
        }
        if (Refund::where('order_id', $order->id)->exists()) {
            return false;
        }

        $forLater = $order->fulfil_date !== null
            && \Illuminate\Support\Carbon::parse($order->fulfil_date)->isAfter(today());
        if ($forLater) {
            return true;
        }

        try {
            return (bool) (app(OnlineOrderingGateService::class)->status()['open'] ?? false);
        } catch (\Throwable) {
            return false;
        }
    }

    /**
     * Put a system-cancelled order back to waiting-for-payment so the normal
     * confirmation path moves it to the kitchen. Deliberately outside the
     * order state machine (cancelled is final for everything else); guarded by
     * canRevive(). The caller holds the order row lock.
     */
    public function revive(Order $order): void
    {
        $before = $order->only(['status', 'cancellation_reason', 'cancelled_at']);

        // A query update, not a model save: OrderObserver (rightly) refuses to
        // move any order out of cancelled, and this is the one deliberate
        // exception, guarded above.
        Order::query()->whereKey($order->id)->update([
            'status' => 'payment_pending',
            'cancellation_reason' => null,
            'cancelled_at' => null,
            'cancelled_by' => null,
            'updated_at' => now(),
        ]);
        $order->refresh();

        // The cancel released the promo slot; the paid path consumes a draft.
        OrderPromotion::where('order_id', $order->id)
            ->where('status', 'released')
            ->update(['status' => 'draft']);

        app(AuditLogService::class)->log(
            'order.revived_late_payment',
            'Order',
            $order->id,
            $before,
            ['status' => 'payment_pending'],
            ['reason' => 'Bank confirmed payment after the unpaid cleanup cancelled the order'],
        );

        Log::info('LatePayment: revived cancelled order for a late bank confirmation', ['order_id' => $order->id]);
    }

    /**
     * The payment row is already confirmed by the caller (inside its
     * transaction). Record the refund owed and notify after commit.
     */
    public function refundStrandedPayment(Order $order, Payment $payment): Refund
    {
        $refund = app(RefundWorkflowService::class)->recordLatePaymentRefund($order, $payment);

        DB::afterCommit(function () use ($order, $payment, $refund): void {
            try {
                app(RefundWorkflowService::class)->notifyLatePaymentRefund($refund);
            } catch (\Throwable $e) {
                report($e);
            }

            try {
                $order->loadMissing('customer');
                $who = trim(($order->customer?->name ?? 'Customer') . ' ' . ($order->customer?->phone ?? ''));
                $body = sprintf(
                    'Payment of MVR %s for order #%s (%s) arrived after the order had been cancelled. It is under Refunds → Owed: send it back and mark it paid out.',
                    number_format(((int) $payment->amount_laar) / 100, 2, '.', ','),
                    $order->order_number ?? $order->id,
                    $who,
                );
                $sms = app(SmsService::class);
                foreach (OwnerPhones::for('owner_late_payment') as $phone) {
                    $sms->send(new SmsMessage(
                        to: $phone,
                        message: $body,
                        type: 'owner_late_payment',
                        referenceType: 'order',
                        referenceId: (string) $order->id,
                        idempotencyKey: 'late-payment:' . $payment->id . ':' . $phone,
                    ));
                }
            } catch (\Throwable $e) {
                report($e);
            }
        });

        return $refund;
    }
}
