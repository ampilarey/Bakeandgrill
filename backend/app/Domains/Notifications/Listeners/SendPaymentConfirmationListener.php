<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Listeners;

use App\Domains\Notifications\Services\PaymentConfirmationNotifier;
use App\Domains\Orders\Events\OrderPaid;
use App\Models\Order;
use Illuminate\Support\Facades\Log;

/**
 * Synchronous retry fallback for payment confirmation SMS + email.
 *
 * PaymentService calls PaymentConfirmationNotifier inside DB::afterCommit when
 * BML/Stripe confirms payment. This listener runs on OrderPaid without a queue
 * worker so delivery still succeeds if the sync call failed or was skipped.
 *
 * SmsService idempotency key ('order:paid:confirm:{order_number}') prevents duplicates.
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
