<?php

declare(strict_types=1);

namespace App\Domains\Realtime\Services;

use App\Domains\Realtime\DTOs\StreamEvent;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * SSE stream wrapper.
 *
 * When REALTIME_USE_REDIS=true is set in .env AND Redis is available,
 * this service subscribes to a Redis Pub/Sub channel for zero-latency updates.
 *
 * Otherwise it falls back to DB polling every ~1s.
 * Switching between modes does NOT require controller changes.
 */
class SseStreamService
{
    private const HEARTBEAT_INTERVAL = 15;

    private const POLL_INTERVAL_MS = 1000000; // 1 second in microseconds

    private const MAX_EXECUTION_SECONDS = 55; // Leave 5s buffer before PHP timeout

    public function stream(callable $fetchEvents, string $initialCursor = ''): StreamedResponse
    {
        return new StreamedResponse(
            function () use ($fetchEvents, $initialCursor): void {
                $this->disableOutputBuffering();
                $this->runDbPollingLoop($fetchEvents, $initialCursor);
            },
            200,
            $this->sseHeaders(),
        );
    }

    /**
     * Redis-backed SSE stream for a single order status channel.
     * Subscribes to "order.{orderId}" channel; emits events in real-time.
     * Falls back to DB polling if Redis is unavailable or not configured.
     */
    public function streamOrderViaRedis(int $orderId, callable $fetchEvents, string $initialCursor = ''): StreamedResponse
    {
        if (! $this->redisEnabled()) {
            return $this->stream($fetchEvents, $initialCursor);
        }

        return new StreamedResponse(
            function () use ($orderId, $fetchEvents, $initialCursor): void {
                $this->disableOutputBuffering();

                // First emit any events since the cursor (catch-up)
                $cursor = $initialCursor;
                $events = $fetchEvents($cursor);
                foreach ($events as $event) {
                    echo $event->toSseString();
                    $cursor = $event->id;
                }
                if (! empty($events)) {
                    flush();
                }

                $startedAt = time();

                try {
                    Redis::subscribe(["order.{$orderId}"], function (string $message) use (&$cursor, $startedAt): void {
                        if (connection_aborted()) {
                            throw new \RuntimeException('client_disconnected');
                        }

                        if (time() - $startedAt >= self::MAX_EXECUTION_SECONDS) {
                            echo "retry: 100\n\n";
                            flush();
                            throw new \RuntimeException('max_execution');
                        }

                        $data = json_decode($message, true);
                        if (! is_array($data)) {
                            return;
                        }

                        $eventType = $data['type'] ?? 'order.updated';
                        $payload   = $data['payload'] ?? [];
                        $id        = (string) ($payload['updated_at'] ?? now()->toIso8601String());

                        $event = new StreamEvent(id: $id, type: $eventType, data: json_encode($payload));
                        echo $event->toSseString();
                        flush();
                        $cursor = $id;

                        // Send heartbeat on every Redis message so the connection stays alive
                        echo StreamEvent::heartbeat();
                        flush();
                    });
                } catch (\RuntimeException $e) {
                    // Normal termination conditions
                    Log::debug('SseStreamService: Redis stream ended', ['reason' => $e->getMessage()]);
                } catch (\Throwable $e) {
                    Log::warning('SseStreamService: Redis stream error', ['error' => $e->getMessage()]);
                    // Fall through — connection will close naturally
                }
            },
            200,
            $this->sseHeaders(),
        );
    }

    /**
     * Headers required for SSE to work correctly,
     * including nginx proxy buffering disable.
     */
    public function sseHeaders(): array
    {
        return [
            'Content-Type'      => 'text/event-stream',
            'Cache-Control'     => 'no-cache',
            'Connection'        => 'keep-alive',
            'X-Accel-Buffering' => 'no',
        ];
    }

    public function redisEnabled(): bool
    {
        return config('realtime.use_redis', false)
            && extension_loaded('redis') || class_exists(\Predis\Client::class);
    }

    // ── Private ──────────────────────────────────────────────────────────────

    private function runDbPollingLoop(callable $fetchEvents, string $cursor): void
    {
        $startedAt     = time();
        $lastHeartbeat = time();

        while (true) {
            if (connection_aborted()) {
                break;
            }

            if (time() - $startedAt >= self::MAX_EXECUTION_SECONDS) {
                echo "retry: 100\n\n";
                flush();
                break;
            }

            if (time() - $lastHeartbeat >= self::HEARTBEAT_INTERVAL) {
                echo StreamEvent::heartbeat();
                flush();
                $lastHeartbeat = time();
            }

            /** @var StreamEvent[] $events */
            $events = $fetchEvents($cursor);

            foreach ($events as $event) {
                echo $event->toSseString();
                $cursor = $event->id;
            }

            if (! empty($events)) {
                flush();
            }

            usleep(self::POLL_INTERVAL_MS);
        }
    }

    private function disableOutputBuffering(): void
    {
        while (ob_get_level() > 0) {
            ob_end_flush();
        }

        set_time_limit(60);
    }
}
