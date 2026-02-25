<?php

declare(strict_types=1);

namespace App\Domains\Realtime\DTOs;

/**
 * Represents a single SSE event to be streamed to the client.
 */
final readonly class StreamEvent
{
    public function __construct(
        /** Monotonic cursor: "{updated_at_unix}:{id}" */
        public string $id,
        /** SSE event type, e.g. order.updated, kds.ticket.updated */
        public string $type,
        /** JSON-encoded payload string */
        public string $data,
    ) {}

    public function toSseString(): string
    {
        return "id: {$this->id}\nevent: {$this->type}\ndata: {$this->data}\n\n";
    }

    public static function heartbeat(): string
    {
        return ": ping\n\n";
    }
}
