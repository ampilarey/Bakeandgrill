<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Listeners;

use App\Domains\Notifications\Services\PaymentConfirmationNotifier;
use App\Domains\Orders\Events\OrderPaid;
use App\Models\Order;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

/**
 * Queued payment confirmation SMS + email for fully paid orders.
 *
 * Runs after DB commit on OrderPaid so POS /payments responses are not
 * blocked on the Dhiraagu SMS round-trip (often 10–20s). SmsService
 * idempotency ('order:paid:confirm:{order_number}') prevents duplicates
 * if PaymentService also notified synchronously on the BML path.
 */
class SendPaymentConfirmationListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

    public int $tries = 3;

    public int $backoff = 5;

    public int $timeout = 60;

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
