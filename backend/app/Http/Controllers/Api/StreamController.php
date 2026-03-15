<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Realtime\Services\KdsStreamProvider;
use App\Domains\Realtime\Services\OrderStreamProvider;
use App\Domains\Realtime\Services\SseStreamService;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
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
     * POST /api/orders/{orderId}/stream-ticket
     *
     * Issues a short-lived, one-time-use ticket for the public SSE stream.
     * Requires auth:sanctum (customer token). The ticket is stored in cache
     * for 60 seconds and deleted after first use, so the real auth token
     * never appears in the URL or server logs.
     */
    public function issueStreamTicket(Request $request, int $orderId): JsonResponse
    {
        $order = Order::findOrFail($orderId);
        $user  = $request->user();

        // Customer must own the order
        if ($user instanceof Customer && $order->customer_id !== $user->id) {
            abort(403, 'Not your order.');
        }

        $ticket = Str::random(64);
        $ttl    = 60; // seconds

        Cache::put('stream_ticket:' . $ticket, [
            'order_id'    => $orderId,
            'customer_id' => $user instanceof Customer ? $user->id : null,
        ], $ttl);

        return response()->json(['ticket' => $ticket, 'expires_in' => $ttl]);
    }

    /**
     * GET /api/stream/order-status/{orderId}?ticket=...
     *
     * Public SSE endpoint. Accepts a short-lived ticket (NOT the real auth
     * token) to authenticate the connection. Ticket is one-time-use and
     * expires in 60 seconds so it is safe in URLs and server logs.
     */
    public function publicOrderStatus(Request $request, int $orderId): StreamedResponse
    {
        $ticketValue = $request->query('ticket', '');

        // Ticket is mandatory — no silent fall-through
        if ($ticketValue === '') {
            abort(401, 'Stream ticket required.');
        }

        $cacheKey = 'stream_ticket:' . $ticketValue;
        $payload  = Cache::get($cacheKey);

        if ($payload === null) {
            abort(401, 'Invalid or expired stream ticket.');
        }

        if ((int) $payload['order_id'] !== $orderId) {
            abort(403, 'Ticket does not match this order.');
        }

        // One-time use — delete immediately after validation
        Cache::forget($cacheKey);

        $order = Order::findOrFail($orderId);

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

        $fetchEvents = function (string $c) use ($order): array {
            $order->refresh();
            [$since, $sinceId] = $this->orderProvider->parseCursor($c);

            if ($order->updated_at > $since || ($order->updated_at == $since && $order->id > $sinceId)) {
                $eventType = match ($order->status) {
                    'paid'      => 'order.paid',
                    'completed' => 'order.completed',
                    'cancelled' => 'order.cancelled',
                    default     => 'order.updated',
                };
                $newCursor = $order->updated_at->getPreciseTimestamp(3) . '.' . $order->id;

                return [new \App\Domains\Realtime\DTOs\StreamEvent(
                    id: $newCursor,
                    type: $eventType,
                    data: json_encode([
                        'id'           => $order->id,
                        'order_number' => $order->order_number,
                        'status'       => $order->status,
                        'paid_at'      => $order->paid_at?->toIso8601String(),
                        'updated_at'   => $order->updated_at?->toIso8601String(),
                    ], JSON_UNESCAPED_UNICODE),
                )];
            }

            return [];
        };

        // Use Redis pub/sub for single-order tracking when available — lower latency,
        // no DB polling. Falls back to DB polling if Redis is not configured.
        return $this->sse->streamOrderViaRedis($order->id, $fetchEvents, (string) $cursor);
    }
}
