<?php

declare(strict_types=1);

namespace App\Domains\Realtime\Listeners;

use App\Domains\Orders\Events\OrderStatusChanged;
use App\Domains\Realtime\Services\RedisEventPublisher;
use Illuminate\Support\Facades\Log;

/**
 * Publishes order status changes to Redis pub/sub for real-time SSE clients.
 * Extracted from OrderObserver so the real-time concern is self-contained here.
 */
class PublishOrderStatusToRedisListener implements \Illuminate\Contracts\Queue\ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

    public int $tries = 3;

    public function __construct(private readonly RedisEventPublisher $redis) {}

    public function handle(OrderStatusChanged $event): void
    {
        $data = $event->data;

        $eventType = match ($data->status) {
            'paid' => 'order.paid',
            'completed' => 'order.completed',
            'cancelled' => 'order.cancelled',
            'partial' => 'order.partial',
            default => 'order.updated',
        };

        try {
            $this->redis->publishOrderEvent($data->orderId, $eventType, [
                'id' => $data->orderId,
                'status' => $data->status,
                'updated_at' => $data->updatedAt,
            ]);
        } catch (\Throwable $e) {
            Log::warning('PublishOrderStatusToRedisListener: failed', [
                'order_id' => $data->orderId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
