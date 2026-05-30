<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\KitchenProductionBatch;
use App\Models\KitchenProductionItem;
use App\Models\KitchenProductionVariance;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class KitchenProductionService
{
    public function __construct(
        private readonly AuditLogService $audit,
    ) {}

    public function getOrCreateOrderBoundBatch(Order $order, User $user, string $source = 'kds'): KitchenProductionBatch
    {
        $existing = KitchenProductionBatch::where('order_id', $order->id)
            ->where('production_type', 'order_bound')
            ->whereNotIn('status', ['cancelled', 'received'])
            ->first();

        if ($existing) {
            return $existing;
        }

        return KitchenProductionBatch::create([
            'batch_no' => KitchenProductionBatchNumberGenerator::next(),
            'production_type' => 'order_bound',
            'source' => $source,
            'status' => 'draft',
            'order_id' => $order->id,
            'produced_by' => $user->id,
        ]);
    }

    /**
     * @param array{qty?: float, notes?: string|null} $payload
     */
    public function markOrderItemCooked(
        Order $order,
        OrderItem $orderItem,
        User $user,
        array $payload,
        ?Request $request = null,
    ): KitchenProductionItem {
        if ($orderItem->order_id !== $order->id) {
            throw ValidationException::withMessages(['order_item' => ['Item does not belong to this order.']]);
        }

        if (!in_array($order->status, ['in_progress', 'preparing', 'paid', 'pending'], true)) {
            throw ValidationException::withMessages(['order' => ['Order is not in a cookable state.']]);
        }

        $qty = (float) ($payload['qty'] ?? $orderItem->quantity);
        if ($qty <= 0) {
            throw ValidationException::withMessages(['qty' => ['Quantity must be positive.']]);
        }

        return DB::transaction(function () use ($order, $orderItem, $user, $qty, $payload, $request) {
            $batch = $this->getOrCreateOrderBoundBatch($order, $user);

            $prodItem = KitchenProductionItem::firstOrCreate(
                [
                    'kitchen_production_batch_id' => $batch->id,
                    'order_item_id' => $orderItem->id,
                ],
                [
                    'order_id' => $order->id,
                    'item_id' => $orderItem->item_id,
                    'variant_id' => $orderItem->variant_id,
                    'produced_qty' => 0,
                    'unit' => 'pcs',
                    'expected_receive_qty' => (float) $orderItem->quantity,
                    'status' => 'pending',
                ],
            );

            $oldStatus = $prodItem->status;
            $newProduced = min((float) $orderItem->quantity, (float) $prodItem->produced_qty + $qty);
            $prodItem->update([
                'produced_qty' => $newProduced,
                'status' => $newProduced >= (float) $orderItem->quantity ? 'produced' : 'pending',
                'kitchen_notes' => $payload['notes'] ?? $prodItem->kitchen_notes,
            ]);

            $orderItem->update([
                'kitchen_produced_qty' => $newProduced,
                'status' => $newProduced >= (float) $orderItem->quantity ? 'produced' : 'producing',
            ]);

            if ($batch->status === 'draft') {
                $batch->update(['status' => 'submitted', 'submitted_at' => now(), 'submitted_by' => $user->id]);
            }

            $this->recomputeOrderHandover($order->fresh(['items']));
            $this->maybeSetKitchenDone($order->fresh(), $user, $request);

            $this->audit->log(
                'kitchen.production.item_cooked',
                'KitchenProductionItem',
                $prodItem->id,
                ['status' => $oldStatus, 'produced_qty' => (float) $prodItem->getOriginal('produced_qty')],
                ['status' => $prodItem->status, 'produced_qty' => $newProduced],
                ['order_id' => $order->id, 'order_item_id' => $orderItem->id, 'batch_id' => $batch->id, 'user_id' => $user->id, 'role' => $user->role?->slug, 'source' => 'kds'],
                $request,
            );

            return $prodItem->fresh();
        });
    }

    public function markOrderKitchenDone(Order $order, User $user, ?Request $request = null): Order
    {
        return DB::transaction(function () use ($order, $user, $request) {
            if (!in_array($order->status, ['in_progress', 'preparing'], true)) {
                throw ValidationException::withMessages(['order' => ['Only in-progress orders can be marked kitchen done.']]);
            }

            $batch = $this->getOrCreateOrderBoundBatch($order, $user);
            $order->loadMissing('items');

            foreach ($order->items as $orderItem) {
                $prodItem = KitchenProductionItem::firstOrCreate(
                    [
                        'kitchen_production_batch_id' => $batch->id,
                        'order_item_id' => $orderItem->id,
                    ],
                    [
                        'order_id' => $order->id,
                        'item_id' => $orderItem->item_id,
                        'variant_id' => $orderItem->variant_id,
                        'unit' => 'pcs',
                        'expected_receive_qty' => (float) $orderItem->quantity,
                    ],
                );

                $qty = (float) $orderItem->quantity;
                $prodItem->update([
                    'produced_qty' => $qty,
                    'expected_receive_qty' => $qty,
                    'status' => 'produced',
                ]);
                $orderItem->update(['kitchen_produced_qty' => $qty, 'status' => 'produced']);
            }

            $batch->update(['status' => 'submitted', 'submitted_at' => now(), 'submitted_by' => $user->id]);

            if ($order->kitchen_done_at === null) {
                $order->update([
                    'kitchen_done_at' => now(),
                    'kitchen_done_by' => $user->id,
                ]);
                $this->audit->log(
                    'order.kitchen_done',
                    'Order',
                    $order->id,
                    ['kitchen_done_at' => null],
                    ['kitchen_done_at' => $order->fresh()->kitchen_done_at?->toIso8601String()],
                    ['source' => 'kds', 'user_id' => $user->id, 'batch_id' => $batch->id],
                    $request,
                );
            }

            $this->recomputeOrderHandover($order->fresh(['items']));

            return $order->fresh(['items', 'kitchenDoneBy']);
        });
    }

    /** @param array<string, mixed> $payload */
    public function createBatch(User $user, array $payload, ?Request $request = null): KitchenProductionBatch
    {
        $type = $payload['production_type'] ?? 'prepared_stock';
        if ($type === 'prepared_stock' && !$user->hasPermission('kitchen.production.create')) {
            abort(403);
        }

        return DB::transaction(function () use ($user, $payload, $type, $request) {
            $batch = KitchenProductionBatch::create([
                'batch_no' => KitchenProductionBatchNumberGenerator::next(),
                'production_type' => $type,
                'source' => $payload['source'] ?? 'kds',
                'status' => 'draft',
                'station' => $payload['station'] ?? null,
                'order_id' => $payload['order_id'] ?? null,
                'produced_by' => $user->id,
                'notes' => $payload['notes'] ?? null,
            ]);

            foreach ($payload['items'] ?? [] as $line) {
                KitchenProductionItem::create([
                    'kitchen_production_batch_id' => $batch->id,
                    'order_id' => $batch->order_id,
                    'item_id' => $line['item_id'] ?? null,
                    'variant_id' => $line['variant_id'] ?? null,
                    'free_text_name' => $line['free_text_name'] ?? null,
                    'produced_qty' => (float) ($line['produced_qty'] ?? 0),
                    'unit' => $line['unit'] ?? 'pcs',
                    'expected_receive_qty' => (float) ($line['expected_receive_qty'] ?? $line['produced_qty'] ?? 0),
                    'batch_code' => $line['batch_code'] ?? null,
                    'expires_at' => $line['expires_at'] ?? null,
                    'status' => 'produced',
                    'kitchen_notes' => $line['notes'] ?? null,
                ]);
            }

            $this->audit->log(
                'kitchen.production.created',
                'KitchenProductionBatch',
                $batch->id,
                [],
                ['status' => 'draft', 'production_type' => $type],
                ['batch_id' => $batch->id, 'user_id' => $user->id, 'role' => $user->role?->slug],
                $request,
            );

            return $batch->fresh(['items']);
        });
    }

    public function submitBatch(KitchenProductionBatch $batch, User $user, ?Request $request = null): KitchenProductionBatch
    {
        if (in_array($batch->status, ['cancelled', 'received'], true)) {
            throw ValidationException::withMessages(['batch' => ['Batch cannot be submitted.']]);
        }

        $old = $batch->status;
        $batch->update([
            'status' => 'submitted',
            'submitted_at' => now(),
            'submitted_by' => $user->id,
        ]);

        $this->audit->log(
            'kitchen.production.submitted',
            'KitchenProductionBatch',
            $batch->id,
            ['status' => $old],
            ['status' => 'submitted'],
            ['batch_id' => $batch->id, 'user_id' => $user->id],
            $request,
        );

        return $batch->fresh(['items']);
    }

    public function cancelBatch(KitchenProductionBatch $batch, User $user, ?string $reason, ?Request $request = null): KitchenProductionBatch
    {
        if ($batch->produced_by !== $user->id && !$user->hasPermission('kitchen.production.manage')) {
            abort(403);
        }

        $batch->update([
            'status' => 'cancelled',
            'cancelled_by' => $user->id,
            'cancelled_at' => now(),
            'cancellation_reason' => $reason,
        ]);

        $this->audit->log(
            'kitchen.production.cancelled',
            'KitchenProductionBatch',
            $batch->id,
            [],
            ['status' => 'cancelled'],
            ['batch_id' => $batch->id, 'user_id' => $user->id, 'reason' => $reason],
            $request,
        );

        return $batch->fresh();
    }

    /** @param array{qty: float, reason?: string, notes?: string} $payload */
    public function recordWaste(KitchenProductionItem $item, User $user, array $payload, ?Request $request = null): KitchenProductionVariance
    {
        $item->increment('waste_qty', $payload['qty']);

        $variance = KitchenProductionVariance::create([
            'kitchen_production_batch_id' => $item->kitchen_production_batch_id,
            'kitchen_production_item_id' => $item->id,
            'variance_type' => 'waste',
            'qty' => $payload['qty'],
            'unit' => $item->unit,
            'reason' => $payload['reason'] ?? null,
            'recorded_by' => $user->id,
            'notes' => $payload['notes'] ?? null,
        ]);

        $this->audit->log(
            'kitchen.production.waste',
            'KitchenProductionVariance',
            $variance->id,
            [],
            ['qty' => $payload['qty']],
            ['batch_id' => $item->kitchen_production_batch_id, 'item_id' => $item->id, 'user_id' => $user->id],
            $request,
        );

        return $variance;
    }

    /** @param array{qty: float, reason?: string, notes?: string} $payload */
    public function recordRemake(KitchenProductionItem $item, User $user, array $payload, ?Request $request = null): KitchenProductionVariance
    {
        $variance = KitchenProductionVariance::create([
            'kitchen_production_batch_id' => $item->kitchen_production_batch_id,
            'kitchen_production_item_id' => $item->id,
            'variance_type' => 'remake',
            'qty' => $payload['qty'],
            'unit' => $item->unit,
            'reason' => $payload['reason'] ?? null,
            'recorded_by' => $user->id,
            'notes' => $payload['notes'] ?? null,
        ]);

        $this->audit->log(
            'kitchen.production.remake',
            'KitchenProductionVariance',
            $variance->id,
            [],
            ['qty' => $payload['qty']],
            ['batch_id' => $item->kitchen_production_batch_id, 'item_id' => $item->id, 'user_id' => $user->id],
            $request,
        );

        return $variance;
    }

    public function recomputeOrderHandover(Order $order): void
    {
        $order->loadMissing('items');
        if ($order->items->isEmpty()) {
            return;
        }

        $total = $order->items->count();
        $produced = $order->items->filter(fn (OrderItem $i) => (float) ($i->kitchen_produced_qty ?? 0) >= (float) $i->quantity)->count();
        $received = $order->items->filter(fn (OrderItem $i) => (float) ($i->kitchen_received_qty ?? 0) >= (float) $i->quantity)->count();

        $status = match (true) {
            $received === $total => 'received',
            $received > 0 => 'partially_received',
            $produced === $total => 'produced',
            $produced > 0 => 'partially_produced',
            default => 'not_started',
        };

        $order->update(['kitchen_handover_status' => $status]);
    }

    private function maybeSetKitchenDone(Order $order, User $user, ?Request $request): void
    {
        $order->loadMissing('items');
        $allProduced = $order->items->every(
            fn (OrderItem $i) => (float) ($i->kitchen_produced_qty ?? 0) >= (float) $i->quantity,
        );

        if (!$allProduced || $order->kitchen_done_at !== null) {
            return;
        }

        $order->update(['kitchen_done_at' => now(), 'kitchen_done_by' => $user->id]);
        $this->audit->log(
            'order.kitchen_done',
            'Order',
            $order->id,
            ['kitchen_done_at' => null],
            ['kitchen_done_at' => $order->fresh()->kitchen_done_at?->toIso8601String()],
            ['source' => 'kds', 'user_id' => $user->id],
            $request,
        );
    }
}
