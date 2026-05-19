<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\AuditLogService;
use App\Services\OrderCreationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Handles offline POS sync.
 * When the POS comes back online it POSTs queued orders here in a batch.
 *
 * Each entry runs through OrderCreationService directly (not through
 * OrderController::store) because that controller's signature is
 * `store(StoreOrderRequest $request)` — and PHP's strict type-hint
 * meant the old sub-request shim threw a TypeError before a single
 * order made it through.
 */
class OfflineSyncController extends Controller
{
    public function __construct(
        private OrderCreationService $creator,
        private AuditLogService $audit,
    ) {}

    /**
     * Batch sync offline orders.
     *
     * Body: { "orders": [ { ...order_payload, "offline_id": "uuid-from-indexeddb" }, ... ] }
     * Returns:  { "results": [ { "offline_id": ..., "status": "created"|"duplicate"|"error", "order_id": ... } ] }
     */
    public function sync(Request $request): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $validated = $request->validate([
            'orders' => ['required', 'array', 'min:1', 'max:50'],
            'orders.*.offline_id' => ['required', 'string', 'max:64'],
            'orders.*.type' => ['required', 'string'],
            'orders.*.items' => ['required', 'array', 'min:1'],
            'orders.*.items.*.item_id' => ['required', 'integer', 'exists:items,id'],
            'orders.*.items.*.quantity' => ['required', 'integer', 'min:1'],
        ]);

        $results = [];

        foreach ($validated['orders'] as $orderPayload) {
            $offlineId = $orderPayload['offline_id'];

            try {
                $existing = Order::where('offline_id', $offlineId)->first();
                if ($existing) {
                    $results[] = [
                        'offline_id' => $offlineId,
                        'status' => 'duplicate',
                        'order_id' => $existing->id,
                    ];

                    continue;
                }

                $order = $this->creator->createFromPayload(
                    array_merge($orderPayload, ['offline_id' => $offlineId]),
                    $request->user(),
                );

                $this->audit->log(
                    'order.created',
                    'Order',
                    $order->id,
                    [],
                    $order->toArray(),
                    ['source' => 'offline_sync', 'offline_id' => $offlineId],
                    $request,
                );

                $results[] = [
                    'offline_id' => $offlineId,
                    'status' => 'created',
                    'order_id' => $order->id,
                ];
            } catch (ValidationException $e) {
                $results[] = [
                    'offline_id' => $offlineId,
                    'status' => 'error',
                    'message' => collect($e->errors())->flatten()->first() ?: 'Validation failed.',
                ];
            } catch (\Throwable $e) {
                logger()->error('Offline sync failed', [
                    'offline_id' => $offlineId,
                    'error' => $e->getMessage(),
                    'trace' => $e->getTraceAsString(),
                ]);
                $results[] = [
                    'offline_id' => $offlineId,
                    'status' => 'error',
                    'message' => 'Order could not be synced. Please retry or contact support.',
                ];
            }
        }

        return response()->json(['results' => $results]);
    }
}
