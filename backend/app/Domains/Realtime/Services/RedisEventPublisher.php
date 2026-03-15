<?php

declare(strict_types=1);

namespace App\Domains\Realtime\Services;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;

/**
 * Publishes SSE events to Redis Pub/Sub channels.
 *
 * When Redis is available, the SseStreamService subscribes to these channels
 * instead of polling the database, reducing DB load and improving latency.
 *
 * Falls back gracefully: if Redis is unavailable, publishing is a no-op.
 */
class RedisEventPublisher
{
    private bool $enabled;

    public function __construct()
    {
        $this->enabled = config('database.redis.default.host') !== null
            && config('realtime.use_redis', false);
    }

    /**
     * Publish an order update event to the order-specific channel and the global orders channel.
     */
    public function publishOrderEvent(int $orderId, string $eventType, array $payload): void
    {
        if (! $this->enabled) {
            return;
        }

        $message = json_encode([
            'type'    => $eventType,
            'payload' => $payload,
        ]);

        try {
            Redis::publish("orders", $message);
            Redis::publish("order.{$orderId}", $message);
        } catch (\Throwable $e) {
            // Redis failures must never break the main request
            Log::warning('RedisEventPublisher: publish failed', [
                'error'    => $e->getMessage(),
                'order_id' => $orderId,
            ]);
        }
    }

    public function isEnabled(): bool
    {
        return $this->enabled;
    }
}
