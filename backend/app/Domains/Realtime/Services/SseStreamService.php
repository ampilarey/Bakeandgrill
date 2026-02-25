<?php

declare(strict_types=1);

namespace App\Domains\Realtime\Services;

use App\Domains\Realtime\DTOs\StreamEvent;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * SSE stream wrapper.
 *
 * Provides a StreamedResponse that polls the DB every ~1s and emits
 * SSE events. Uses heartbeats every 15s to keep the connection alive.
 *
 * Architecture: DB polling (simple, no Redis dependency).
 * Future: swap provider to Redis pub/sub or DB-listen without changing the controller.
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

                $cursor = $initialCursor;
                $startedAt = time();
                $lastHeartbeat = time();

                while (true) {
                    if (connection_aborted()) {
                        break;
                    }

                    // Stop before PHP max_execution_time kills us
                    if (time() - $startedAt >= self::MAX_EXECUTION_SECONDS) {
                        // Tell client to reconnect immediately
                        echo "retry: 100\n\n";
                        flush();
                        break;
                    }

                    // Heartbeat
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

                    if (!empty($events)) {
                        flush();
                    }

                    usleep(self::POLL_INTERVAL_MS);
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
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no',
        ];
    }

    private function disableOutputBuffering(): void
    {
        // Disable PHP output buffering so flush() works immediately
        while (ob_get_level() > 0) {
            ob_end_flush();
        }

        // Increase execution time for long-lived connections
        set_time_limit(60);
    }
}
