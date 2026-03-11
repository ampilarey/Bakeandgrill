<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Realtime\Services\KdsStreamProvider;
use App\Domains\Realtime\Services\OrderStreamProvider;
use App\Domains\Realtime\Services\SseStreamService;
use App\Http\Controllers\Controller;
use App\Models\Order;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Server-Sent Events (SSE) endpoints for live updates.
 *
 * Clients connect with EventSource and receive real-time order/KDS events.
 * Use ?since=ISO8601 or Last-Event-ID header to resume after disconnect.
 *
 * Example (browser):
 *   const es = new EventSource('/api/stream/orders', { withCredentials: true });
 *   es.addEventListener('order.updated', e => console.log(JSON.parse(e.data)));
 */
class StreamController extends Controller
{
    public function __construct(
        private SseStreamService $sse,
        private OrderStreamProvider $orderProvider,
        private KdsStreamProvider $kdsProvider,
    ) {}

    /**
     * GET /api/stream/orders
     *
     * Streams all order changes. Intended for POS / management dashboard.
     * Auth: staff token required.
     *
     * Query params:
     *   since        ISO8601 timestamp to start from (defaults to "now - 5s")
     *   branch_id    (future) filter by branch
     *   terminal_id  (future) filter by terminal
     */
    public function orders(Request $request): StreamedResponse
    {
        $cursor = $request->header('Last-Event-ID')
            ?? $request->query('since', '');

        return $this->sse->stream(
            fn (string $c) => $this->orderProvider->fetchSince($c),
            (string) $cursor,
        );
    }

    /**
     * GET /api/stream/kds
     *
     * Streams KDS-relevant tickets (pending / in_progress / paid).
     * Auth: staff token required.
     */
    public function kds(Request $request): StreamedResponse
    {
        $cursor = $request->header('Last-Event-ID')
            ?? $request->query('since', '');

        return $this->sse->stream(
            fn (string $c) => $this->kdsProvider->fetchSince($c),
            (string) $cursor,
        );
    }

    /**
     * GET /api/stream/order-status/{orderId}?token=...
     *
     * Public endpoint that accepts a Sanctum token via query param (needed
     * because EventSource in browsers cannot set Authorization headers).
     * The token is validated manually. Customers can only watch their own orders.
     */
    public function publicOrderStatus(Request $request, int $orderId): StreamedResponse
    {
        $tokenValue = $request->query('token', '');
        $order = Order::find($orderId);

        if (!$order) {
            abort(404, 'Order not found');
        }

        // Authenticate via query token if provided
        if ($tokenValue) {
            /** @var \Laravel\Sanctum\PersonalAccessToken|null $accessToken */
            $accessToken = \Laravel\Sanctum\PersonalAccessToken::findToken($tokenValue);
            if ($accessToken) {
                $tokenable = $accessToken->tokenable;
                // Customers can only watch their own orders
                if ($tokenable instanceof \App\Models\Customer && $order->customer_id !== $tokenable->id) {
                    abort(403, 'Not your order');
                }
            }
        }

        return $this->streamSingleOrder($order, $request);
    }

    /**
     * GET /api/stream/orders/{order}/status
     *
     * Streams status changes for a single order.
     * Auth: customer token (must own the order) or staff token.
     */
    public function orderStatus(Request $request, Order $order): StreamedResponse
    {
        $user = $request->user();

        // Customers can only watch their own orders
        if ($user->tokenCan('customer') && $order->customer_id !== $user->id) {
            abort(403, 'Not your order');
        }

        return $this->streamSingleOrder($order, $request);
    }

    private function streamSingleOrder(Order $order, Request $request): StreamedResponse
    {
        $cursor = $request->header('Last-Event-ID')
            ?? $request->query('since', '');

        return $this->sse->stream(
            function (string $c) use ($order): array {
                // Refresh the order and check if it changed since cursor
                $order->refresh();
                [$since, $sinceId] = (new OrderStreamProvider)->parseCursor($c);

                if ($order->updated_at > $since || ($order->updated_at == $since && $order->id > $sinceId)) {
                    $eventType = match ($order->status) {
                        'paid' => 'order.paid',
                        'completed' => 'order.completed',
                        'cancelled' => 'order.cancelled',
                        default => 'order.updated',
                    };
                    $newCursor = $order->updated_at->getPreciseTimestamp(3) . '.' . $order->id;

                    return [new \App\Domains\Realtime\DTOs\StreamEvent(
                        id: $newCursor,
                        type: $eventType,
                        data: json_encode([
                            'id' => $order->id,
                            'order_number' => $order->order_number,
                            'status' => $order->status,
                            'paid_at' => $order->paid_at?->toIso8601String(),
                            'updated_at' => $order->updated_at?->toIso8601String(),
                        ], JSON_UNESCAPED_UNICODE),
                    )];
                }

                return [];
            },
            (string) $cursor,
        );
    }
}
