<?php

declare(strict_types=1);

namespace App\Domains\Payments\Listeners;

use App\Domains\Notifications\Services\PaymentConfirmationNotifier;
use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Orders\Repositories\OrderRepositoryInterface;
use App\Domains\Payments\Events\PaymentConfirmed;
use App\Domains\Payments\Repositories\PaymentRepositoryInterface;
use App\Domains\Payments\Services\OrderPaymentStateService;
use App\Models\Order;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Handles PaymentConfirmed — checks if the order is now fully paid and,
 * if so, transitions the order status and dispatches OrderPaid.
 *
 * This listener covers the Stripe webhook path (StripeController fires
 * PaymentConfirmed but does not directly transition orders). The BML path
 * (PaymentService::confirmPayment) still handles its own transition
 * synchronously inside DB::afterCommit; the idempotency guard below
 * prevents a double OrderPaid dispatch.
 *
 * Synchronous after commit so Stripe/gateway paid transitions are not
 * stranded when the queue worker is down. Idempotent via paid_at / status.
 */
class PaymentConfirmedListener
{
    public bool $afterCommit = true;

    public function __construct(
        private readonly PaymentRepositoryInterface $payments,
        private readonly OrderRepositoryInterface $orders,
        private readonly PaymentConfirmationNotifier $confirmationNotifier,
        private readonly OrderPaymentStateService $paymentState,
    ) {}

    public function handle(PaymentConfirmed $event): void
    {
        $data = $event->data;

        $order = $this->orders->findById($data->orderId);
        if (!$order) {
            Log::warning('PaymentConfirmedListener: order not found', ['order_id' => $data->orderId]);

            return;
        }

        $paidLaar = $this->payments->sumAmountLaarForOrder($order->id, ['paid', 'confirmed', 'completed']);
        $orderLaar = (int) ($order->total_laar ?? round((float) $order->total * 100));

        // BML path sets paid_at synchronously inside PaymentService::confirmPayment
        // before this listener runs. If the sync SMS failed or was skipped,
        // still attempt delivery here (SmsService idempotency prevents duplicates).
        if ($order->paid_at !== null || in_array($order->status, ['paid', 'completed', 'cancelled'], true)) {
            if ($paidLaar >= $orderLaar && $order->status !== 'cancelled') {
                try {
                    $this->confirmationNotifier->notify($order->loadMissing(['customer', 'payments']));
                } catch (\Throwable $e) {
                    Log::error('PaymentConfirmedListener: SMS retry failed', [
                        'order_id' => $order->id,
                        'error' => $e->getMessage(),
                    ]);
                }
            }

            return;
        }

        Log::info('PaymentConfirmedListener: checking full payment', [
            'payment_id' => $data->paymentId,
            'order_id' => $order->id,
            'paid_laar' => $paidLaar,
            'order_laar' => $orderLaar,
        ]);

        if ($paidLaar < $orderLaar) {
            $this->paymentState->syncPaymentStatus($order);

            return;
        }

        // Order is now fully paid — transition status and fire OrderPaid.
        DB::transaction(function () use ($order): void {
            // Lock the row before reading status to prevent concurrent transitions.
            $locked = Order::lockForUpdate()->find($order->id);
            if (!$locked
                || $locked->paid_at !== null
                || in_array($locked->status, ['paid', 'completed', 'cancelled'], true)
            ) {
                // Balance settle on an already-paid-once ticket (prepaid
                // dine-in add-ons via pay link): correct payment_status
                // partial → paid without a second OrderPaid dispatch.
                if ($locked && $locked->paid_at !== null
                    && !in_array($locked->status, ['cancelled', 'refunded'], true)
                ) {
                    $this->paymentState->syncPaymentStatus($locked);
                }

                return;
            }

            // Online orders held at payment_pending move to pending (visible on KDS).
            // POS orders already in the kitchen queue go straight to paid.
            $newStatus = $locked->status === 'payment_pending' ? 'pending' : 'paid';
            // ALSO set payment_status='paid' alongside the lifecycle status.
            // Without this, gateway-confirmed orders (Stripe path, and any
            // future PaymentConfirmed-only flow) leave payment_status at
            // 'unpaid'/'partial' even though the order is fully paid.
            // The POS Open Tickets UNPAID badge filters on payment_status —
            // so the ticket would still show UNPAID despite being settled.
            // (BML path sets this directly inside PaymentService::confirmPayment,
            //  which is why the regression only manifested on Stripe.)
            $this->orders->updateStatus($locked->id, $newStatus, [
                'paid_at' => now(),
                'payment_status' => 'paid',
            ]);

            $fresh = $this->orders->findById($locked->id);
            if (!$fresh) {
                return;
            }

            try {
                $this->confirmationNotifier->notify($fresh);
            } catch (\Throwable $e) {
                Log::error('PaymentConfirmedListener: notification failed', [
                    'order_id' => $fresh->id,
                    'error' => $e->getMessage(),
                ]);
                // Do not re-throw — notification failure must not block OrderPaid.
            }

            OrderPaid::dispatch(OrderPaidData::fromOrder($fresh, true));
        });
    }
}
