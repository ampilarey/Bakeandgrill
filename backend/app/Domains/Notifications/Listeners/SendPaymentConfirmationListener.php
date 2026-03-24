<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Listeners;

use App\Domains\Notifications\Services\PaymentConfirmationNotifier;
use App\Domains\Orders\Events\OrderPaid;
use App\Models\Order;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

/**
 * Queued retry fallback for payment confirmation SMS + email.
 *
 * PaymentService already calls PaymentConfirmationNotifier synchronously inside
 * DB::afterCommit, so the SMS is usually sent before this job even runs.
 * The SmsService idempotency key ('order:paid:confirm:{id}') ensures no duplicate
 * is delivered — this job is a no-op if the sync call already succeeded.
 *
 * Queued (`ShouldQueue`) — a running worker is required for the retry to fire.
 * Without a worker, the sync path in PaymentService still guarantees delivery.
 */
class SendPaymentConfirmationListener implements ShouldQueue
{
    public bool $afterCommit = true;
    public string $queue = 'default';
    public int $tries = 3;
    public int $backoff = 5;

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
