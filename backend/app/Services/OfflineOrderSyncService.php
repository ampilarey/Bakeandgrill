<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\OfflineSyncRecord;
use App\Models\Order;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class OfflineOrderSyncService
{
    private const ALLOWED_METHODS = ['cash', 'card', 'qr', 'bank_transfer'];

    private const BLOCKED_METHODS = ['house_account', 'bml_pay', 'bml', 'online', 'wallet', 'cheque', 'card_pos'];

    public function __construct(
        private OrderCreationService $creator,
        private OrderOfflineSettlementService $settlement,
        private InventoryDeductionService $inventory,
        private AuditLogService $audit,
        private OfflineOrderRewardsService $rewards,
    ) {}

    /**
     * @param array<int, array<string, mixed>> $orders
     * @return array<int, array<string, mixed>>
     */
    public function syncBatch(array $orders, User $user, ?Request $request = null): array
    {
        $results = [];

        foreach ($orders as $orderPayload) {
            $results[] = $this->processOne($orderPayload, $user, $request);
        }

        return $results;
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public function processOne(array $payload, User $user, ?Request $request = null): array
    {
        $localOrderId = (string) ($payload['local_order_id'] ?? $payload['idempotency_key'] ?? '');
        $idempotencyKey = (string) ($payload['idempotency_key'] ?? $localOrderId);

        try {
            return DB::transaction(function () use ($payload, $user, $request, $localOrderId, $idempotencyKey): array {
                $payloadHash = $this->hashPayload($payload);

                $existing = OfflineSyncRecord::where('idempotency_key', $idempotencyKey)->lockForUpdate()->first();
                if ($existing !== null) {
                    if ($existing->payload_hash !== $payloadHash) {
                        $existing->update([
                            'status' => 'conflict',
                            'last_error' => 'Idempotency key reused with different payload.',
                        ]);

                        return $this->result($localOrderId, 'conflict', null, false, 'Idempotency key reused with different payload.');
                    }

                    if ($existing->status === 'synced' && $existing->server_order_id) {
                        $order = Order::find($existing->server_order_id);

                        return $this->result(
                            $localOrderId,
                            'synced',
                            $order,
                            (bool) $existing->inventory_conflict,
                            null,
                        );
                    }
                }

                $method = (string) ($payload['payment']['method'] ?? '');
                if (!in_array($method, self::ALLOWED_METHODS, true)) {
                    return $this->recordFailure(
                        $idempotencyKey,
                        $localOrderId,
                        $payload,
                        $payloadHash,
                        $user,
                        "Payment method '{$method}' is not allowed for offline sync.",
                    );
                }

                if (in_array($method, self::BLOCKED_METHODS, true)) {
                    return $this->recordFailure(
                        $idempotencyKey,
                        $localOrderId,
                        $payload,
                        $payloadHash,
                        $user,
                        "Payment method '{$method}' is blocked for offline sync.",
                    );
                }

                $shift = Shift::find((int) ($payload['shift_id'] ?? 0));
                if ($shift === null) {
                    return $this->recordFailure(
                        $idempotencyKey,
                        $localOrderId,
                        $payload,
                        $payloadHash,
                        $user,
                        'Shift not found.',
                        'conflict',
                    );
                }

                if ((int) $shift->user_id !== (int) $user->id) {
                    return $this->recordFailure(
                        $idempotencyKey,
                        $localOrderId,
                        $payload,
                        $payloadHash,
                        $user,
                        'Shift does not belong to the authenticated staff member.',
                        'conflict',
                    );
                }

                $createdAtLocal = Carbon::parse((string) ($payload['created_at_local'] ?? now()->toIso8601String()));
                if ($createdAtLocal->lt($shift->opened_at)) {
                    return $this->recordFailure(
                        $idempotencyKey,
                        $localOrderId,
                        $payload,
                        $payloadHash,
                        $user,
                        'Order was created before the shift opened.',
                        'conflict',
                    );
                }

                if ($shift->closed_at !== null && $createdAtLocal->gte($shift->closed_at)) {
                    return $this->recordFailure(
                        $idempotencyKey,
                        $localOrderId,
                        $payload,
                        $payloadHash,
                        $user,
                        'Order was created after the shift closed.',
                        'conflict',
                    );
                }

                $clientTotals = $payload['totals'] ?? [];
                $items = $this->normalizeItems($payload['items'] ?? []);

                $createPayload = [
                    'type' => $payload['type'],
                    'items' => $items,
                    'device_identifier' => $payload['device_identifier'] ?? null,
                    'shift_id' => $shift->id,
                    'offline_id' => $idempotencyKey,
                    'offline_local_number' => $payload['local_order_number'] ?? null,
                    'offline_sync' => true,
                    'ticket_name' => $payload['ticket_name'] ?? null,
                    'ticket_note' => $payload['ticket_note'] ?? null,
                    'customer_id' => $payload['customer_id'] ?? null,
                    'discount_amount' => $payload['discount_amount'] ?? 0,
                    'print' => !($payload['prepared_locally'] ?? false),
                ];

                if (!empty($payload['restaurant_table_id'])) {
                    $createPayload['restaurant_table_id'] = $payload['restaurant_table_id'];
                }

                $order = $this->creator->createFromPayload($createPayload, $user);

                $rewardsPayload = $payload['rewards'] ?? null;
                if (is_array($rewardsPayload) && $rewardsPayload !== []) {
                    $order = $this->rewards->apply($order, $rewardsPayload, $user);
                }

                if (!$this->totalsMatch($order, $clientTotals)) {
                    throw new \RuntimeException('Client totals do not match server calculation.');
                }

                $paymentAmountLaar = (int) round((float) ($payload['payment']['amount'] ?? 0) * 100);
                $orderTotalLaar = (int) ($order->total_laar ?? round((float) $order->total * 100));
                if ($paymentAmountLaar + 1 < $orderTotalLaar) {
                    throw new \RuntimeException('Payment amount is less than order total.');
                }
                if ($method !== 'cash' && $paymentAmountLaar > $orderTotalLaar + 1) {
                    throw new \RuntimeException('Non-cash payment exceeds order total.');
                }

                $paymentPayload = [
                    'method' => $method,
                    'amount' => (float) ($payload['payment']['amount'] ?? $order->total),
                    'reference_number' => $payload['payment']['reference'] ?? $payload['payment']['reference_number'] ?? null,
                    'idempotency_key' => 'offline:pay:' . $idempotencyKey,
                ];

                [$order] = $this->settlement->settle(
                    $order,
                    $user,
                    $shift,
                    $paymentPayload,
                    printReceipt: true,
                    request: $request,
                );

                $inventoryConflict = $this->inventory->deductForOrderAndDetectConflict($order, $user->id)
                    // A prepared count driven below zero by this sale is the
                    // same kind of news as an ingredient below zero.
                    || app(StockManagementService::class)->preparedStockWentNegativeForOrder((int) $order->id);

                OfflineSyncRecord::updateOrCreate(
                    ['idempotency_key' => $idempotencyKey],
                    [
                        'local_order_id' => $localOrderId,
                        'device_identifier' => $payload['device_identifier'] ?? null,
                        'user_id' => $user->id,
                        'shift_id' => $shift->id,
                        'server_order_id' => $order->id,
                        'status' => 'synced',
                        'payload_hash' => $payloadHash,
                        'inventory_conflict' => $inventoryConflict,
                        'last_error' => null,
                        'synced_at' => now(),
                    ],
                );

                $this->audit->log(
                    'offline.order.synced',
                    'Order',
                    $order->id,
                    [],
                    $order->fresh()->toArray(),
                    [
                        'local_order_id' => $localOrderId,
                        'local_order_number' => $payload['local_order_number'] ?? null,
                        'idempotency_key' => $idempotencyKey,
                        'inventory_conflict' => $inventoryConflict,
                    ],
                    $request,
                );

                return $this->result($localOrderId, 'synced', $order, $inventoryConflict, null);
            });
        } catch (\Throwable $e) {
            logger()->error('Offline POS sync failed', [
                'local_order_id' => $localOrderId,
                'error' => $e->getMessage(),
            ]);

            $payloadHash = $this->hashPayload($payload);

            $existing = OfflineSyncRecord::where('idempotency_key', $idempotencyKey)->first();
            if ($existing !== null && $existing->status === 'synced' && $existing->server_order_id) {
                $order = Order::find($existing->server_order_id);

                return $this->result($localOrderId, 'synced', $order, (bool) $existing->inventory_conflict, null);
            }

            if ($existing === null || $existing->status !== 'synced') {
                OfflineSyncRecord::updateOrCreate(
                    ['idempotency_key' => $idempotencyKey],
                    [
                        'local_order_id' => $localOrderId,
                        'device_identifier' => $payload['device_identifier'] ?? null,
                        'user_id' => $user->id,
                        'shift_id' => isset($payload['shift_id']) ? (int) $payload['shift_id'] : null,
                        'status' => 'failed',
                        'payload_hash' => $payloadHash,
                        'last_error' => $e->getMessage(),
                    ],
                );
            }

            $status = str_contains(strtolower($e->getMessage()), 'totals') ? 'conflict' : 'failed';

            return $this->result($localOrderId, $status, null, false, $e->getMessage());
        }
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function hashPayload(array $payload): string
    {
        $normalized = $payload;
        unset($normalized['sync_attempted_at']);

        return hash('sha256', json_encode($normalized, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
    }

    /**
     * @param array<int, array<string, mixed>> $items
     * @return array<int, array<string, mixed>>
     */
    private function normalizeItems(array $items): array
    {
        return array_map(static function (array $item): array {
            $normalized = [
                'item_id' => (int) $item['item_id'],
                'quantity' => (int) $item['quantity'],
            ];

            if (!empty($item['variant_id'])) {
                $normalized['variant_id'] = (int) $item['variant_id'];
            }

            if (!empty($item['packaging_option_id'])) {
                $normalized['packaging_option_id'] = (int) $item['packaging_option_id'];
            }

            if (!empty($item['modifiers'])) {
                $normalized['modifiers'] = $item['modifiers'];
            }

            if (!empty($item['notes'])) {
                $normalized['notes'] = $item['notes'];
            }

            // A platter's picks and a bundle's extras. Dropped here until the
            // 2026-09-07 audit, so an offline platter sale could never sync.
            if (!empty($item['children']) && is_array($item['children'])) {
                $normalized['children'] = array_values(array_map(static fn (array $child): array => array_filter([
                    'item_id' => (int) ($child['item_id'] ?? 0),
                    'quantity' => (int) ($child['quantity'] ?? 1),
                    'group_id' => !empty($child['group_id']) ? (int) $child['group_id'] : null,
                    'variant_id' => !empty($child['variant_id']) ? (int) $child['variant_id'] : null,
                ], static fn ($v) => $v !== null), $item['children']));
            }

            return $normalized;
        }, $items);
    }

    /**
     * @param array<string, mixed> $clientTotals
     */
    private function totalsMatch(Order $order, array $clientTotals): bool
    {
        if ($clientTotals === []) {
            return true;
        }

        $tolerance = 1; // 1 laar

        $serverTotalLaar = (int) ($order->total_laar ?? round((float) $order->total * 100));
        $clientTotalLaar = (int) round((float) ($clientTotals['total'] ?? $clientTotals['total_mvr'] ?? 0) * 100);

        if (abs($serverTotalLaar - $clientTotalLaar) > $tolerance) {
            return false;
        }

        if (isset($clientTotals['subtotal'])) {
            $serverSubLaar = (int) ($order->subtotal_laar ?? round((float) $order->subtotal * 100));
            $clientSubLaar = (int) round((float) $clientTotals['subtotal'] * 100);
            if (abs($serverSubLaar - $clientSubLaar) > $tolerance) {
                return false;
            }
        }

        if (isset($clientTotals['tax'])) {
            $serverTaxLaar = (int) ($order->tax_laar ?? round((float) $order->tax_amount * 100));
            $clientTaxLaar = (int) round((float) $clientTotals['tax'] * 100);
            if (abs($serverTaxLaar - $clientTaxLaar) > $tolerance) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function recordFailure(
        string $idempotencyKey,
        string $localOrderId,
        array $payload,
        string $payloadHash,
        User $user,
        string $message,
        string $status = 'failed',
    ): array {
        OfflineSyncRecord::updateOrCreate(
            ['idempotency_key' => $idempotencyKey],
            [
                'local_order_id' => $localOrderId,
                'device_identifier' => $payload['device_identifier'] ?? null,
                'user_id' => $user->id,
                'shift_id' => isset($payload['shift_id']) ? (int) $payload['shift_id'] : null,
                'status' => $status,
                'payload_hash' => $payloadHash,
                'last_error' => $message,
            ],
        );

        return $this->result($localOrderId, $status, null, false, $message);
    }

    /**
     * @return array<string, mixed>
     */
    private function result(
        string $localOrderId,
        string $status,
        ?Order $order,
        bool $inventoryConflict,
        ?string $message,
    ): array {
        return [
            'local_order_id' => $localOrderId,
            'status' => $status,
            'server_order_id' => $order?->id,
            'server_order_number' => $order?->order_number,
            'inventory_conflict' => $inventoryConflict,
            'message' => $message,
        ];
    }
}
