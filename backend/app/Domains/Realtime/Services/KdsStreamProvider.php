<?php

declare(strict_types=1);

namespace App\Domains\Realtime\Services;

use App\Domains\Realtime\DTOs\StreamEvent;
use App\Models\Order;

/**
 * Order changes since the cursor, as refetch signals for the kitchen screen.
 * The screen reloads its list (KitchenBoard rules) on each event; the payload
 * is a summary, never the source of truth.
 */
class KdsStreamProvider
{
    public function __construct(private OrderStreamProvider $orderStreamProvider) {}

    /**
     * @return StreamEvent[]
     */
    public function fetchSince(string $cursor): array
    {
        [$since, $sinceId] = $this->orderStreamProvider->parseCursor($cursor);

        /*
         * Kitchen audit, 2026-09-26: every order change, not only those still
         * in a kitchen status. The screen refetches on any event, and a
         * cancelled or completed order never produced one, so it sat on the
         * board until the next minute's poll.
         */
        $orders = Order::with(['items.modifiers'])
            ->where('type', '!=', 'gift_card')
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
            $cursor = $order->updated_at->getPreciseTimestamp(3) . '.' . $order->id;

            $events[] = new StreamEvent(
                id: $cursor,
                type: 'kds.ticket.updated',
                data: json_encode($this->kdsPayload($order), JSON_UNESCAPED_UNICODE),
            );
        }

        return $events;
    }

    private function kdsPayload(Order $order): array
    {
        $payload = [
            'id' => $order->id,
            'order_number' => $order->order_number,
            'type' => $order->type,
            'status' => $order->status,
            'notes' => $order->notes,
            'created_at' => $order->created_at?->toIso8601String(),
            'updated_at' => $order->updated_at?->toIso8601String(),
            'kitchen_done_at' => $order->kitchen_done_at?->toIso8601String(),
            'items' => $order->items->map(fn ($item) => [
                'id' => $item->id,
                'item_name' => $item->item_name,
                'quantity' => $item->quantity,
                'modifiers' => $item->modifiers->map(fn ($m) => [
                    'modifier_name' => $m->modifier_name,
                ])->values(),
            ])->values(),
        ];

        // Delivery badge + address summary for KDS display
        if ($order->type === 'delivery') {
            $payload['delivery_summary'] = implode(', ', array_filter([
                $order->delivery_contact_name,
                $order->delivery_address_line1,
                $order->delivery_island,
            ]));
        }

        return $payload;
    }
}
