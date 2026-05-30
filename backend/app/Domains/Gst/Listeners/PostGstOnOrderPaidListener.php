<?php

declare(strict_types=1);

namespace App\Domains\Gst\Listeners;

use App\Domains\Gst\Services\GstLedgerPoster;
use App\Domains\Orders\Events\OrderPaid;
use App\Models\Order;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

class PostGstOnOrderPaidListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

    public function __construct(
        private readonly GstLedgerPoster $poster,
    ) {}

    public function handle(OrderPaid $event): void
    {
        try {
            $order = Order::query()->find($event->data->orderId);
            if (!$order) {
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
