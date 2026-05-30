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
use Illuminate\Validation\ValidationException;

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
            $batch->load('items');
            $receivingBatch = $this->createReceivingBatch($batch, $user, $payload);

            foreach ($batch->items as $prodItem) {
                if (in_array($prodItem->status, ['received', 'cancelled'], true)) {
                    continue;
                }
                $this->receiveProductionItem(
                    $receivingBatch,
                    $prodItem,
                    (float) $prodItem->produced_qty,
                    $payload,
                    $user,
                    $request,
                );
            }

            return $this->finalizeReceivingBatch($receivingBatch, $batch, $user, $request);
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
            $qty = (float) ($payload['received_qty'] ?? $prodItem->produced_qty);
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

            $this->receiveProductionItem($receivingBatch, $prodItem, $qty, $payload, $user, $request);

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
            $receivingBatch = KitchenReceivingBatch::create([
                'kitchen_production_batch_id' => $batch->id,
                'received_by' => $user->id,
                'received_at' => now(),
                'status' => 'rejected',
                'receive_location' => $payload['receive_location'] ?? 'pos_counter',
                'notes' => $payload['notes'] ?? null,
            ]);

            $rejectedQty = (float) ($payload['rejected_qty'] ?? $prodItem->produced_qty);
            $recvItem = KitchenReceivingItem::create([
                'kitchen_receiving_batch_id' => $receivingBatch->id,
                'kitchen_production_item_id' => $prodItem->id,
                'received_qty' => 0,
                'rejected_qty' => $rejectedQty,
                'missing_qty' => max(0, (float) $prodItem->produced_qty - $rejectedQty),
                'condition' => $payload['condition'] ?? 'damaged',
                'action' => 'reject',
                'notes' => $payload['notes'] ?? null,
            ]);

            $prodItem->update(['status' => 'rejected']);

            KitchenProductionVariance::create([
                'kitchen_production_batch_id' => $batch->id,
                'kitchen_production_item_id' => $prodItem->id,
                'variance_type' => 'rejected',
                'qty' => $rejectedQty,
                'unit' => $prodItem->unit,
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
    ): KitchenReceivingItem {
        $expected = (float) $prodItem->expected_receive_qty ?: (float) $prodItem->produced_qty;
        $receivedQty = min($qty, (float) $prodItem->produced_qty);
        $missing = max(0, $expected - $receivedQty);

        $recvItem = KitchenReceivingItem::create([
            'kitchen_receiving_batch_id' => $receivingBatch->id,
            'kitchen_production_item_id' => $prodItem->id,
            'received_qty' => $receivedQty,
            'rejected_qty' => 0,
            'missing_qty' => $missing,
            'condition' => $payload['condition'] ?? 'good',
            'action' => $receivedQty >= $expected ? 'accept' : 'partial_accept',
            'notes' => $payload['notes'] ?? null,
        ]);

        $newStatus = $receivedQty >= (float) $prodItem->produced_qty ? 'received' : 'partially_received';
        $prodItem->update(['status' => $newStatus]);

        if ($prodItem->order_item_id) {
            $orderItem = OrderItem::find($prodItem->order_item_id);
            if ($orderItem) {
                $orderItem->update([
                    'kitchen_received_qty' => $receivedQty,
                    'status' => $newStatus === 'received' ? 'received' : 'produced',
                ]);
            }
        }

        if ($missing > 0) {
            KitchenProductionVariance::create([
                'kitchen_production_batch_id' => $prodItem->kitchen_production_batch_id,
                'kitchen_production_item_id' => $prodItem->id,
                'variance_type' => 'shortage',
                'qty' => $missing,
                'unit' => $prodItem->unit,
                'recorded_by' => $user->id,
            ]);
        }

        $this->applyPreparedStock($receivingBatch, $prodItem, (int) round($receivedQty), $user);

        $this->audit->log(
            'kitchen.receiving.received',
            'KitchenReceivingItem',
            $recvItem->id,
            [],
            ['received_qty' => $receivedQty, 'status' => $newStatus],
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

        $key = 'kitchen:receive:' . $receivingBatch->id . ':item:' . $prodItem->id;

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
            ['delta' => $qty],
            ['receiving_batch_id' => $receivingBatch->id, 'user_id' => $user->id],
            null,
        );
    }
}
