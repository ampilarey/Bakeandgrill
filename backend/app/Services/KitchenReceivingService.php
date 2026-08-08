<?php

declare(strict_types=1);

namespace App\Services;

use App\Domains\Kitchen\Support\KitchenHandoverSettings;
use App\Models\Item;
use App\Models\KitchenProductionBatch;
use App\Models\KitchenProductionItem;
use App\Models\KitchenProductionVariance;
use App\Models\KitchenReceivingBatch;
use App\Models\KitchenReceivingItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use App\Models\Variant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class KitchenReceivingService
{
    public function __construct(
        private readonly AuditLogService $audit,
        private readonly KitchenProductionService $production,
        private readonly StockManagementService $stock,
    ) {}

    /** @return \Illuminate\Support\Collection<int, KitchenProductionBatch> */
    public function pendingBatches(?int $orderId = null)
    {
        $query = KitchenProductionBatch::with(['items.orderItem', 'items.menuItem', 'order', 'producer'])
            ->whereIn('status', ['submitted', 'partially_received'])
            ->orderByDesc('submitted_at');

        if ($orderId) {
            $query->where('order_id', $orderId);
        }

        return $query->get();
    }

    /** @param array<string, mixed> $payload */
    public function receiveAll(KitchenProductionBatch $batch, User $user, array $payload, ?Request $request = null): KitchenReceivingBatch
    {
        return DB::transaction(function () use ($batch, $user, $payload, $request) {
            $lockedBatch = KitchenProductionBatch::whereKey($batch->id)->lockForUpdate()->firstOrFail();
            $lockedBatch->load('items');
            $receivingBatch = $this->createReceivingBatch($lockedBatch, $user, $payload);

            foreach ($lockedBatch->items as $prodItem) {
                $item = KitchenProductionItem::whereKey($prodItem->id)->lockForUpdate()->first();
                if (!$item || in_array((string) $item->status, ['received', 'cancelled', 'rejected'], true)) {
                    continue;
                }
                $this->receiveProductionItem(
                    $receivingBatch,
                    $item,
                    (float) $item->produced_qty,
                    $payload,
                    $user,
                    $request,
                );
            }

            return $this->finalizeReceivingBatch($receivingBatch, $lockedBatch->fresh(['items']), $user, $request);
        });
    }

    /** @param array<string, mixed> $payload */
    public function receiveItem(
        KitchenProductionBatch $batch,
        KitchenProductionItem $prodItem,
        User $user,
        array $payload,
        ?Request $request = null,
    ): KitchenReceivingBatch {
        return DB::transaction(function () use ($batch, $prodItem, $user, $payload, $request) {
            KitchenProductionBatch::whereKey($batch->id)->lockForUpdate()->firstOrFail();
            $lockedItem = KitchenProductionItem::whereKey($prodItem->id)->lockForUpdate()->firstOrFail();

            if (in_array((string) $lockedItem->status, ['received', 'cancelled', 'rejected'], true)) {
                // Idempotent no-op for fully terminal items — return latest receiving batch.
                $existing = KitchenReceivingBatch::query()
                    ->where('kitchen_production_batch_id', $batch->id)
                    ->orderByDesc('id')
                    ->first();

                if ($existing) {
                    return $existing->fresh(['items']) ?? $existing;
                }

                abort(422, 'This production item can no longer be received.');
            }

            $idempotencyKey = isset($payload['idempotency_key']) && is_string($payload['idempotency_key'])
                && $payload['idempotency_key'] !== ''
                ? $payload['idempotency_key']
                : null;

            if ($idempotencyKey !== null) {
                $prior = KitchenReceivingItem::query()
                    ->where('idempotency_key', $idempotencyKey)
                    ->first();
                if ($prior) {
                    $existingBatch = KitchenReceivingBatch::query()->find($prior->kitchen_receiving_batch_id);
                    if ($existingBatch) {
                        return $existingBatch->fresh(['items']) ?? $existingBatch;
                    }
                }
            }

            $qty = (float) ($payload['received_qty'] ?? max(
                0,
                (float) $lockedItem->produced_qty - (float) KitchenReceivingItem::query()
                    ->where('kitchen_production_item_id', $lockedItem->id)
                    ->sum('received_qty'),
            ));
            $receivingBatch = KitchenReceivingBatch::firstOrCreate(
                [
                    'kitchen_production_batch_id' => $batch->id,
                    'received_by' => $user->id,
                    'status' => 'partially_received',
                ],
                [
                    'received_at' => now(),
                    'receive_location' => $payload['receive_location'] ?? 'pos_counter',
                    'notes' => $payload['notes'] ?? null,
                ],
            );

            $this->receiveProductionItem($receivingBatch, $lockedItem, $qty, $payload, $user, $request);

            return $this->finalizeReceivingBatch($receivingBatch, $batch->fresh(['items']), $user, $request);
        });
    }

    /** @param array<string, mixed> $payload */
    public function rejectItem(
        KitchenProductionBatch $batch,
        KitchenProductionItem $prodItem,
        User $user,
        array $payload,
        ?Request $request = null,
    ): KitchenReceivingItem {
        return DB::transaction(function () use ($batch, $prodItem, $user, $payload, $request) {
            KitchenProductionBatch::whereKey($batch->id)->lockForUpdate()->firstOrFail();
            $lockedItem = KitchenProductionItem::whereKey($prodItem->id)->lockForUpdate()->firstOrFail();

            if (in_array((string) $lockedItem->status, ['received', 'cancelled', 'rejected'], true)) {
                abort(422, 'This production item can no longer be rejected.');
            }

            // Partially received items must not be rejected after stock was accepted.
            $alreadyReceived = (float) KitchenReceivingItem::query()
                ->where('kitchen_production_item_id', $lockedItem->id)
                ->sum('received_qty');
            if ($alreadyReceived > 0 || $lockedItem->status === 'partially_received') {
                abort(422, 'Cannot reject an item that has already been partially received.');
            }

            $receivingBatch = KitchenReceivingBatch::create([
                'kitchen_production_batch_id' => $batch->id,
                'received_by' => $user->id,
                'received_at' => now(),
                'status' => 'rejected',
                'receive_location' => $payload['receive_location'] ?? 'pos_counter',
                'notes' => $payload['notes'] ?? null,
            ]);

            $rejectedQty = (float) ($payload['rejected_qty'] ?? $lockedItem->produced_qty);
            $recvItem = KitchenReceivingItem::create([
                'kitchen_receiving_batch_id' => $receivingBatch->id,
                'kitchen_production_item_id' => $lockedItem->id,
                'received_qty' => 0,
                'rejected_qty' => $rejectedQty,
                'missing_qty' => max(0, (float) $lockedItem->produced_qty - $rejectedQty),
                'condition' => $payload['condition'] ?? 'damaged',
                'action' => 'reject',
                'notes' => $payload['notes'] ?? null,
            ]);

            $lockedItem->update(['status' => 'rejected']);

            KitchenProductionVariance::create([
                'kitchen_production_batch_id' => $batch->id,
                'kitchen_production_item_id' => $lockedItem->id,
                'variance_type' => 'rejected',
                'qty' => $rejectedQty,
                'unit' => $lockedItem->unit,
                'reason' => $payload['notes'] ?? null,
                'recorded_by' => $user->id,
            ]);

            if ($batch->order_id) {
                $order = Order::find($batch->order_id);
                if ($order) {
                    $order->update(['kitchen_handover_status' => 'remake_requested']);
                }
            }

            $this->audit->log(
                'kitchen.receiving.rejected',
                'KitchenReceivingItem',
                $recvItem->id,
                [],
                ['rejected_qty' => $rejectedQty],
                ['batch_id' => $batch->id, 'order_id' => $batch->order_id, 'user_id' => $user->id, 'source' => 'pos'],
                $request,
            );

            return $recvItem;
        });
    }

    /** @param array<string, mixed> $payload */
    public function requestRemake(
        KitchenProductionBatch $batch,
        KitchenProductionItem $prodItem,
        User $user,
        array $payload,
        ?Request $request = null,
    ): KitchenProductionVariance {
        $variance = KitchenProductionVariance::create([
            'kitchen_production_batch_id' => $batch->id,
            'kitchen_production_item_id' => $prodItem->id,
            'variance_type' => 'remake',
            'qty' => (float) ($payload['qty'] ?? $prodItem->produced_qty),
            'unit' => $prodItem->unit,
            'reason' => $payload['reason'] ?? $payload['notes'] ?? null,
            'recorded_by' => $user->id,
            'notes' => $payload['notes'] ?? null,
        ]);

        if ($batch->order_id) {
            Order::where('id', $batch->order_id)->update(['kitchen_handover_status' => 'remake_requested']);
        }

        $this->audit->log(
            'kitchen.receiving.remake_requested',
            'KitchenProductionVariance',
            $variance->id,
            [],
            ['variance_type' => 'remake'],
            ['batch_id' => $batch->id, 'user_id' => $user->id, 'source' => 'pos'],
            $request,
        );

        return $variance;
    }

    /** @param array<string, mixed> $payload */
    private function createReceivingBatch(KitchenProductionBatch $batch, User $user, array $payload): KitchenReceivingBatch
    {
        return KitchenReceivingBatch::create([
            'kitchen_production_batch_id' => $batch->id,
            'received_by' => $user->id,
            'received_at' => now(),
            'status' => 'partially_received',
            'receive_location' => $payload['receive_location'] ?? 'pos_counter',
            'notes' => $payload['notes'] ?? null,
        ]);
    }

    /** @param array<string, mixed> $payload */
    private function receiveProductionItem(
        KitchenReceivingBatch $receivingBatch,
        KitchenProductionItem $prodItem,
        float $qty,
        array $payload,
        User $user,
        ?Request $request,
    ): ?KitchenReceivingItem {
        if (in_array((string) $prodItem->status, ['received', 'cancelled', 'rejected'], true)) {
            return null;
        }

        $produced = (float) $prodItem->produced_qty;
        $expected = (float) $prodItem->expected_receive_qty ?: $produced;

        $idempotencyKey = isset($payload['idempotency_key']) && is_string($payload['idempotency_key'])
            && $payload['idempotency_key'] !== ''
            ? $payload['idempotency_key']
            : null;

        if ($idempotencyKey !== null) {
            $existingByKey = KitchenReceivingItem::query()
                ->where('idempotency_key', $idempotencyKey)
                ->first();
            if ($existingByKey) {
                return $existingByKey;
            }
        }

        // Cumulative accepted quantity across prior receiving rows for this item.
        $priorAccepted = (float) KitchenReceivingItem::query()
            ->where('kitchen_production_item_id', $prodItem->id)
            ->sum('received_qty');

        if ($priorAccepted >= $produced && $produced > 0) {
            $prodItem->update(['status' => 'received']);

            return null;
        }

        // received_qty is always an incremental acceptance for this request
        // (not a cumulative target). Retries must send idempotency_key.
        $remaining = max(0, $produced - $priorAccepted);
        $incremental = min(max(0, $qty), $remaining);
        $targetCumulative = $priorAccepted + $incremental;

        if ($incremental <= 0) {
            // Already fully received or zero qty — no-op.
            return null;
        }

        $missing = max(0, $expected - $targetCumulative);

        $recvItem = KitchenReceivingItem::create([
            'kitchen_receiving_batch_id' => $receivingBatch->id,
            'kitchen_production_item_id' => $prodItem->id,
            'received_qty' => $incremental,
            'rejected_qty' => 0,
            'missing_qty' => $missing,
            'condition' => $payload['condition'] ?? 'good',
            'action' => $targetCumulative >= $expected ? 'accept' : 'partial_accept',
            'notes' => $payload['notes'] ?? null,
            'idempotency_key' => $idempotencyKey,
        ]);

        $newStatus = $targetCumulative >= $produced ? 'received' : 'partially_received';
        $prodItem->update(['status' => $newStatus]);

        if ($prodItem->order_item_id) {
            $orderItem = OrderItem::find($prodItem->order_item_id);
            if ($orderItem) {
                $orderItem->update([
                    'kitchen_received_qty' => $targetCumulative,
                    'status' => $newStatus === 'received' ? 'received' : 'produced',
                ]);
            }
        }

        if ($missing > 0 && $newStatus === 'received') {
            KitchenProductionVariance::create([
                'kitchen_production_batch_id' => $prodItem->kitchen_production_batch_id,
                'kitchen_production_item_id' => $prodItem->id,
                'variance_type' => 'shortage',
                'qty' => $missing,
                'unit' => $prodItem->unit,
                'recorded_by' => $user->id,
            ]);
        }

        $stockUnits = max(0, (int) round($incremental, 0, PHP_ROUND_HALF_UP));
        $this->applyPreparedStock($receivingBatch, $prodItem, $stockUnits, $user, $targetCumulative);

        $this->audit->log(
            'kitchen.receiving.received',
            'KitchenReceivingItem',
            $recvItem->id,
            [],
            [
                'received_qty' => $incremental,
                'cumulative_received_qty' => $targetCumulative,
                'status' => $newStatus,
            ],
            ['batch_id' => $prodItem->kitchen_production_batch_id, 'order_id' => $prodItem->order_id, 'user_id' => $user->id, 'source' => 'pos'],
            $request,
        );

        return $recvItem;
    }

    private function finalizeReceivingBatch(
        KitchenReceivingBatch $receivingBatch,
        KitchenProductionBatch $batch,
        User $user,
        ?Request $request,
    ): KitchenReceivingBatch {
        $batch->load('items');
        $allReceived = $batch->items->every(fn (KitchenProductionItem $i) => $i->status === 'received');
        $anyReceived = $batch->items->contains(fn (KitchenProductionItem $i) => in_array($i->status, ['received', 'partially_received'], true));

        $batchStatus = $allReceived ? 'received' : ($anyReceived ? 'partially_received' : $batch->status);
        $batch->update(['status' => $batchStatus]);

        $receivingBatch->update(['status' => $allReceived ? 'received' : 'partially_received']);

        if ($batch->order_id) {
            $order = Order::find($batch->order_id);
            if ($order) {
                $this->production->recomputeOrderHandover($order->fresh(['items']));
                if ($allReceived) {
                    $order->update([
                        'pos_received_at' => now(),
                        'pos_received_by' => $user->id,
                    ]);
                }
            }
        }

        return $receivingBatch->fresh(['items']);
    }

    private function applyPreparedStock(
        KitchenReceivingBatch $receivingBatch,
        KitchenProductionItem $prodItem,
        int $qty,
        User $user,
        ?float $cumulativeReceived = null,
    ): void {
        $batch = $prodItem->batch ?? KitchenProductionBatch::find($prodItem->kitchen_production_batch_id);
        if (!$batch || $batch->production_type !== 'prepared_stock') {
            return;
        }

        if (!KitchenHandoverSettings::receiveUpdatesPreparedStock()) {
            return;
        }

        if (KitchenHandoverSettings::managerVerificationForPreparedStock()) {
            return;
        }

        if ($qty <= 0 || !$prodItem->item_id) {
            return;
        }

        // Stable per production-item cumulative watermark so retries / new
        // receiving batches cannot inflate prepared stock for the same units.
        $watermark = $cumulativeReceived ?? $qty;
        $key = 'kitchen:receive:prod-item:' . $prodItem->id . ':to:' . round((float) $watermark, 4);

        if ($prodItem->variant_id) {
            $variant = Variant::find($prodItem->variant_id);
            if ($variant) {
                $this->stock->adjustVariantPreparedStock(
                    $variant,
                    $qty,
                    $user->id,
                    $key,
                    'Kitchen production received',
                );
            }
        } else {
            $item = Item::find($prodItem->item_id);
            if ($item) {
                $this->stock->adjustItemPreparedStock(
                    $item,
                    $qty,
                    $user->id,
                    $key,
                    'Kitchen production received',
                );
            }
        }

        $this->audit->log(
            'kitchen.prepared_stock.updated',
            'KitchenProductionItem',
            $prodItem->id,
            [],
            ['delta' => $qty, 'cumulative' => $watermark],
            ['receiving_batch_id' => $receivingBatch->id, 'user_id' => $user->id],
            null,
        );
    }
}
