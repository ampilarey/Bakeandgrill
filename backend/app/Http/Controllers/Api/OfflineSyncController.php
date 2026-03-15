<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\OrderController;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Handles offline POS sync.
 * When the POS comes back online it POSTs queued orders here in a batch.
 * Each order is processed through the standard OrderController::store path
 * and the result (success or error) is returned per-order.
 */
class OfflineSyncController extends Controller
{
    public function __construct(private OrderController $orders) {}

    /**
     * Batch sync offline orders.
     *
     * Body: { "orders": [ { ...order_payload, "offline_id": "uuid-from-indexeddb" }, ... ] }
     * Returns:  { "results": [ { "offline_id": ..., "status": "created"|"duplicate"|"error", "order_id": ... } ] }
     */
    public function sync(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'orders'               => ['required', 'array', 'min:1', 'max:50'],
            'orders.*.offline_id'  => ['required', 'string'],
            'orders.*.type'        => ['required', 'string'],
            'orders.*.items'       => ['required', 'array'],
        ]);

        $results = [];

        foreach ($validated['orders'] as $orderPayload) {
            $offlineId = $orderPayload['offline_id'];

            try {
                // Use idempotency: if order with this offline_id already synced, skip
                $existing = \App\Models\Order::where('offline_id', $offlineId)->first();
                if ($existing) {
                    $results[] = [
                        'offline_id' => $offlineId,
                        'status'     => 'duplicate',
                        'order_id'   => $existing->id,
                    ];
                    continue;
                }

                // Inject offline_id into the request for the OrderController
                $subRequest = Request::create(
                    '/api/orders',
                    'POST',
                    array_merge($orderPayload, ['offline_id' => $offlineId]),
                    [],
                    [],
                    $request->server(),
                );
                $subRequest->setUserResolver($request->getUserResolver());

                $response = $this->orders->store($subRequest);
                $data      = json_decode($response->getContent(), true);

                $results[] = [
                    'offline_id' => $offlineId,
                    'status'     => 'created',
                    'order_id'   => $data['order']['id'] ?? null,
                ];
            } catch (\Throwable $e) {
                logger()->error('Offline sync failed', [
                    'offline_id' => $offlineId,
                    'error'      => $e->getMessage(),
                    'trace'      => $e->getTraceAsString(),
                ]);
                $results[] = [
                    'offline_id' => $offlineId,
                    'status'     => 'error',
                    'message'    => 'Order could not be synced. Please retry or contact support.',
                ];
            }
        }

        return response()->json(['results' => $results]);
    }
}
