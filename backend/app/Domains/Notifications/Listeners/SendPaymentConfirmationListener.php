<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Listeners;

use App\Domains\Notifications\Services\PaymentConfirmationNotifier;
use App\Domains\Orders\Events\OrderPaid;
use App\Models\Order;
use Illuminate\Support\Facades\Log;

/**
 * Payment confirmation SMS + email for fully paid orders.
 *
 * Runs synchronously when OrderPaid fires. POS addPayments dispatches
 * OrderPaid inside DeferAfterResponse (after the JSON response is sent),
 * so the Dhiraagu round-trip does not slow the Charge button. Keeping
 * this listener off the queue avoids silent SMS loss when no queue
 * worker is running. SmsService idempotency
 * ('order:paid:confirm:{order_number}') prevents duplicates if
 * PaymentService also notified on the BML path.
 */
class SendPaymentConfirmationListener
{
    public bool $afterCommit = true;

    public function __construct(private PaymentConfirmationNotifier $notifier) {}

    public function handle(OrderPaid $event): void
    {
        $order = Order::with(['items.item', 'customer'])->find($event->data->orderId);

        if (!$order) {
            Log::warning('SendPaymentConfirmationListener: order not found', ['order_id' => $event->data->orderId]);

            return;
        }

        $this->notifier->notify($order);
    }
}
