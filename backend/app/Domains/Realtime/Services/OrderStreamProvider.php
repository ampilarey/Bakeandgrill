<?php

declare(strict_types=1);

namespace App\Domains\Realtime\Services;

use App\Domains\Realtime\DTOs\StreamEvent;
use App\Models\Order;
use Illuminate\Support\Carbon;

/**
 * Fetches orders changed since a given cursor and emits SSE events.
 *
 * Cursor format: "{unix_timestamp}.{id}" e.g. "1738000000.42"
 * This lets us resume without missing events even when updated_at ties.
 */
class OrderStreamProvider
{
    /**
     * @return StreamEvent[]
     */
    public function fetchSince(string $cursor): array
    {
        [$since, $sinceId] = $this->parseCursor($cursor);

        $orders = Order::with(['items.modifiers', 'payments'])
            ->where(function ($q) use ($since, $sinceId): void {
                $q->where('updated_at', '>', $since)
                    ->orWhere(function ($q2) use ($since, $sinceId): void {
                        $q2->where('updated_at', $since)
                            ->where('id', '>', $sinceId);
                    });
            })
            ->orderBy('updated_at')
            ->orderBy('id')
            ->limit(50)
            ->get();

        $events = [];
        foreach ($orders as $order) {
            $eventType = $this->resolveEventType($order);
            $cursor = $order->updated_at->getPreciseTimestamp(3) . '.' . $order->id;

            $events[] = new StreamEvent(
                id: $cursor,
                type: $eventType,
                data: json_encode($this->orderPayload($order), JSON_UNESCAPED_UNICODE),
            );
        }

        return $events;
    }

    /**
     * Parse cursor into [Carbon $since, int $sinceId].
     */
    public function parseCursor(string $cursor): array
    {
        if (empty($cursor)) {
            return [now()->subSeconds(5), 0];
        }

        // ISO8601 format from ?since= param
        if (str_contains($cursor, 'T') || str_contains($cursor, '-')) {
            try {
                return [Carbon::parse($cursor), 0];
            } catch (\Throwable) {
            }
        }

        // Internal cursor format: "timestamp_ms.id"
        $parts = explode('.', $cursor, 2);
        if (count($parts) === 2 && is_numeric($parts[0])) {
            $ts = Carbon::createFromTimestampMs((int) $parts[0]);

            return [$ts, (int) $parts[1]];
        }

        return [now()->subSeconds(5), 0];
    }

    private function resolveEventType(Order $order): string
    {
        return match ($order->status) {
            'paid' => 'order.paid',
            'completed' => 'order.completed',
            'cancelled' => 'order.cancelled',
            'partial' => 'order.partial',
            default => 'order.updated',
        };
    }

    private function orderPayload(Order $order): array
    {
        return [
            'id' => $order->id,
            'order_number' => $order->order_number,
            'type' => $order->type,
            'status' => $order->status,
            'total' => $order->total,
            'paid_at' => $order->paid_at?->toIso8601String(),
            'updated_at' => $order->updated_at?->toIso8601String(),
            'delivery' => $order->type === 'delivery' ? [
                'contact_name' => $order->delivery_contact_name,
                'contact_phone' => $order->delivery_contact_phone,
                'address_line1' => $order->delivery_address_line1,
                'island' => $order->delivery_island,
                'eta_at' => $order->delivery_eta_at?->toIso8601String(),
            ] : null,
        ];
    }
}
