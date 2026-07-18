<?php

declare(strict_types=1);

namespace App\Domains\Gst\Listeners;

use App\Domains\Gst\Services\GstLedgerPoster;
use App\Domains\Orders\Events\OrderPaid;
use App\Models\Order;
use Illuminate\Support\Facades\Log;

/**
 * Posts GST ledger entries when an order is paid.
 * Synchronous after commit so GST posts even if the queue worker is down.
 */
class PostGstOnOrderPaidListener
{
    public bool $afterCommit = true;

    public function __construct(
        private readonly GstLedgerPoster $poster,
    ) {}

    public function handle(OrderPaid $event): void
    {
        try {
            $order = Order::query()->find($event->data->orderId);
            if (!$order || $order->type === 'gift_card') {
                return;
            }

            $this->poster->postOrderOnPayment($order);
        } catch (\Throwable $e) {
            Log::error('PostGstOnOrderPaidListener failed', [
                'order_id' => $event->data->orderId ?? null,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}
