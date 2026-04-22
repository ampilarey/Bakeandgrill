<?php

declare(strict_types=1);

namespace App\Domains\Payments\Listeners;

use App\Domains\Notifications\Services\PaymentConfirmationNotifier;
use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Orders\Repositories\OrderRepositoryInterface;
use App\Domains\Payments\Events\PaymentConfirmed;
use App\Domains\Payments\Repositories\PaymentRepositoryInterface;
use App\Models\Order;
use Illuminate\Contracts\Queue\ShouldQueue;
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
 * Idempotent: the order status check (not already 'paid'/'completed')
 * prevents a second OrderPaid from being fired if the listener runs twice.
 */
class PaymentConfirmedListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

    public int $tries = 3;

    public int $backoff = 5;

    public int $timeout = 30;

    public function __construct(
        private readonly PaymentRepositoryInterface $payments,
        private readonly OrderRepositoryInterface $orders,
        private readonly PaymentConfirmationNotifier $confirmationNotifier,
    ) {}

    public function failed(PaymentConfirmed $event, \Throwable $e): void
    {
        Log::critical('PaymentConfirmedListener: exhausted retries', [
            'order_id'   => $event->data->orderId,
            'payment_id' => $event->data->paymentId,
            'error'      => $e->getMessage(),
        ]);

        if (app()->bound('sentry')) {
            \Sentry\captureException($e);
        }
    }

    public function handle(PaymentConfirmed $event): void
    {
        $data = $event->data;

        $order = $this->orders->findById($data->orderId);
        if (!$order) {
            Log::warning('PaymentConfirmedListener: order not found', ['order_id' => $data->orderId]);
            return;
        }

        // Already fully processed — nothing to do (idempotency guard).
        // paid_at being set means we already ran the full payment transition,
        // even if the order is still 'pending' waiting for kitchen action.
        if ($order->paid_at !== null || in_array($order->status, ['paid', 'completed', 'cancelled'], true)) {
            return;
        }

        $paidLaar  = $this->payments->sumAmountLaarForOrder($order->id, ['paid', 'confirmed', 'completed']);
        $orderLaar = (int) ($order->total_laar ?? round((float) $order->total * 100));

        Log::info('PaymentConfirmedListener: checking full payment', [
            'payment_id' => $data->paymentId,
            'order_id'   => $order->id,
            'paid_laar'  => $paidLaar,
            'order_laar' => $orderLaar,
        ]);

        if ($paidLaar < $orderLaar) {
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
                return;
            }

            // Online orders held at payment_pending move to pending (visible on KDS).
            // POS orders already in the kitchen queue go straight to paid.
            $newStatus = $locked->status === 'payment_pending' ? 'pending' : 'paid';
            $this->orders->updateStatus($locked->id, $newStatus, ['paid_at' => now()]);

            $fresh = $this->orders->findById($locked->id);
            if (!$fresh) {
                return;
            }

            try {
                $this->confirmationNotifier->notify($fresh);
            } catch (\Throwable $e) {
                Log::error('PaymentConfirmedListener: notification failed', [
                    'order_id' => $fresh->id,
                    'error'    => $e->getMessage(),
                ]);
                // Do not re-throw — notification failure must not block OrderPaid.
            }

            OrderPaid::dispatch(OrderPaidData::fromOrder($fresh, true));
        });
    }
}
