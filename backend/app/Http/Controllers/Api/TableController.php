<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Orders\DTOs\OrderCancelledData;
use App\Domains\Orders\Events\OrderCancelled;
use App\Http\Controllers\Controller;
use App\Http\Requests\AddTableItemsRequest;
use App\Http\Requests\CloseTableRequest;
use App\Http\Requests\MergeTablesRequest;
use App\Http\Requests\OpenTableRequest;
use App\Http\Requests\SplitTableBillRequest;
use App\Http\Requests\StoreTableRequest;
use App\Http\Requests\UpdateTableRequest;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\RestaurantTable;
use App\Services\AuditLogService;
use App\Services\OrderCreationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TableController extends Controller
{
    public function index(Request $request)
    {
        $query = RestaurantTable::query();

        if ($request->boolean('active_only')) {
            $query->where('is_active', true);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }

        $tables = $query->orderBy('name')->get();

        // The admin "Merge" and "Split" flows both need to know which order
        // is currently open on each table. Without this, admins were
        // dropping into the split modal with no way to identify the
        // target order and the merge UI couldn't surface "no active
        // ticket" errors before sending the request. We resolve the
        // active order id per-table in one cheap query so the response
        // stays a single round-trip.
        $tableIds = $tables->pluck('id')->all();
        $activeOrderMap = [];
        if (!empty($tableIds)) {
            $activeOrderMap = Order::select('id', 'restaurant_table_id', 'order_number', 'total', 'status', 'ticket_name')
                ->whereIn('restaurant_table_id', $tableIds)
                ->whereIn('status', RestaurantTable::SEAT_OWNING_STATUSES)
                ->orderByDesc('id')
                ->get()
                ->groupBy('restaurant_table_id')
                ->map(fn ($group) => $group->first());
        }

        // Source of truth = seat-owning orders. Denormalized status is a cache.
        // Never clobber reserved/closed when the seat is empty.
        $toAvailable = [];
        $toOccupied = [];
        foreach ($tables as $t) {
            $hasActive = isset($activeOrderMap[$t->id]);
            if ($hasActive) {
                if ($t->status !== 'occupied') {
                    $toOccupied[] = $t->id;
                    $t->status = 'occupied';
                }
            } elseif ($t->status === 'occupied') {
                $toAvailable[] = $t->id;
                $t->status = 'available';
            }
        }
        if ($toAvailable !== []) {
            RestaurantTable::whereIn('id', $toAvailable)->update(['status' => 'available']);
        }
        if ($toOccupied !== []) {
            RestaurantTable::whereIn('id', $toOccupied)->update(['status' => 'occupied']);
        }

        $payload = $tables->map(function ($t) use ($activeOrderMap) {
            $active = $activeOrderMap[$t->id] ?? null;
            // Response status always matches linked open check (UI never lies).
            $status = $active ? 'occupied' : (
                in_array($t->status, ['reserved', 'closed'], true) ? $t->status : 'available'
            );

            return array_merge($t->toArray(), [
                'status' => $status,
                'current_order_id' => $active?->id,
                'current_order_number' => $active?->order_number,
                'current_order_total' => $active ? (float) $active->total : null,
                'current_order_label' => $active
                    ? ($active->ticket_name ?: $active->order_number)
                    : null,
            ]);
        });

        return response()->json(['tables' => $payload]);
    }

    public function store(StoreTableRequest $request)
    {
        $table = RestaurantTable::create($request->validated());

        app(AuditLogService::class)->log(
            'table.created',
            'RestaurantTable',
            $table->id,
            [],
            $table->toArray(),
            [],
            $request,
        );

        return response()->json(['table' => $table], 201);
    }

    public function update(UpdateTableRequest $request, $id)
    {
        $table = RestaurantTable::findOrFail($id);
        $oldValues = $table->getOriginal();
        $table->update($request->validated());

        app(AuditLogService::class)->log(
            'table.updated',
            'RestaurantTable',
            $table->id,
            $oldValues,
            $table->toArray(),
            [],
            $request,
        );

        return response()->json(['table' => $table]);
    }

    public function open(OpenTableRequest $request, $id)
    {
        $result = DB::transaction(function () use ($request, $id) {
            // Lock the seat row before the active-order check so concurrent
            // opens cannot both pass and mint two tickets on one table.
            $table = RestaurantTable::query()->lockForUpdate()->findOrFail($id);
            if (!$table->is_active) {
                return ['error' => 'Table is inactive.'];
            }

            $activeOrder = $this->findActiveOrder($table->id);
            if ($activeOrder) {
                return [
                    'error' => 'Table already has an open order.',
                    'order_id' => $activeOrder->id,
                ];
            }

            $payload = $request->validated();
            $payload['type'] = 'dine_in';
            $payload['restaurant_table_id'] = $table->id;

            $order = app(OrderCreationService::class)->createFromPayload(
                $payload,
                $request->user(),
            );

            $oldStatus = $table->status;
            $table->update(['status' => 'occupied']);

            return [
                'order' => $order,
                'table' => $table,
                'old_status' => $oldStatus,
            ];
        });

        if (isset($result['error'])) {
            $payload = ['message' => $result['error']];
            if (isset($result['order_id'])) {
                $payload['order_id'] = $result['order_id'];
            }

            return response()->json($payload, 422);
        }

        app(AuditLogService::class)->log(
            'table.opened',
            'RestaurantTable',
            $result['table']->id,
            ['status' => $result['old_status']],
            ['status' => 'occupied'],
            ['order_id' => $result['order']->id],
            $request,
        );

        return response()->json(['order' => $result['order'], 'table' => $result['table']], 201);
    }

    public function addItems(AddTableItemsRequest $request, $tableId, $orderId)
    {
        $table = RestaurantTable::findOrFail($tableId);
        $order = Order::findOrFail($orderId);

        if ((int) $order->restaurant_table_id !== (int) $table->id) {
            return response()->json(['message' => 'Order does not belong to table.'], 422);
        }

        if (in_array($order->status, ['completed', 'cancelled'], true)) {
            return response()->json(['message' => 'Order cannot be updated.'], 422);
        }

        $validated = $request->validated();
        $order = app(OrderCreationService::class)->addItemsToOrder(
            $order,
            $validated['items'],
            $validated['print'] ?? true,
        );

        // Prepaid dine-in add-ons: keep payment_status honest (paid → partial)
        // so the balance shows in POS and the customer app instead of a
        // silently-underpaid "paid" ticket.
        app(\App\Domains\Payments\Services\OrderPaymentStateService::class)
            ->syncPaymentStatus($order);

        $table->update(['status' => 'occupied']);

        app(AuditLogService::class)->log(
            'table.items_added',
            'Order',
            $order->id,
            [],
            $order->toArray(),
            ['table_id' => $table->id],
            $request,
        );

        return response()->json(['order' => $order, 'table' => $table]);
    }

    public function close(CloseTableRequest $request, $id)
    {
        $table = RestaurantTable::findOrFail($id);
        $oldStatus = $table->status;

        // Floor close is seat management only — payment is not required.
        // Detach any in-flight tickets so the seat can reopen, but leave
        // those orders intact (still chargeable from Open Tickets).
        $detachedOrderIds = DB::transaction(function () use ($table) {
            $ids = Order::query()
                ->where('restaurant_table_id', $table->id)
                ->whereIn('status', RestaurantTable::ACTIVE_ORDER_STATUSES)
                ->pluck('id')
                ->all();

            if ($ids !== []) {
                Order::whereIn('id', $ids)->update(['restaurant_table_id' => null]);
            }

            $table->update(['status' => 'available']);

            return $ids;
        });

        app(AuditLogService::class)->log(
            'table.closed',
            'RestaurantTable',
            $table->id,
            ['status' => $oldStatus],
            ['status' => 'available'],
            ['detached_order_ids' => $detachedOrderIds],
            $request,
        );

        return response()->json(['table' => $table->fresh()]);
    }

    public function merge(MergeTablesRequest $request)
    {
        $validated = $request->validated();

        if ((int) $validated['source_table_id'] === (int) $validated['target_table_id']) {
            return response()->json(['message' => 'Select two different tables.'], 422);
        }

        $service = app(OrderCreationService::class);

        $result = DB::transaction(function () use ($validated, $service) {
            // Lock both seats in id order to avoid deadlocks under concurrent merges.
            $lockIds = [
                (int) $validated['source_table_id'],
                (int) $validated['target_table_id'],
            ];
            sort($lockIds);
            $locked = RestaurantTable::query()
                ->whereIn('id', $lockIds)
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            $sourceTable = $locked->get((int) $validated['source_table_id'])
                ?? RestaurantTable::query()->lockForUpdate()->findOrFail($validated['source_table_id']);
            $targetTable = $locked->get((int) $validated['target_table_id'])
                ?? RestaurantTable::query()->lockForUpdate()->findOrFail($validated['target_table_id']);

            $oldSourceStatus = $sourceTable->status;
            $oldTargetStatus = $targetTable->status;

            $sourceOrder = $this->findActiveOrder($sourceTable->id);
            if (!$sourceOrder) {
                return ['error' => 'No active order on source table.'];
            }

            $targetOrder = $this->findActiveOrder($targetTable->id);
            $cancelledSource = null;

            if ($targetOrder) {
                OrderItem::where('order_id', $sourceOrder->id)
                    ->update(['order_id' => $targetOrder->id]);

                $service->recalculateTotals($targetOrder->fresh());
                $sourceOrder->update(['status' => 'cancelled']);
                $cancelledSource = $sourceOrder->fresh();
            } else {
                $sourceOrder->update(['restaurant_table_id' => $targetTable->id]);
            }

            $sourceTable->update(['status' => 'available']);
            $targetTable->update(['status' => 'occupied']);

            return [
                'source_table' => $sourceTable,
                'target_table' => $targetTable,
                'old_source_status' => $oldSourceStatus,
                'old_target_status' => $oldTargetStatus,
                'cancelled_source' => $cancelledSource,
            ];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        // Fire OrderCancelled for the merged-away source AFTER commit so
        // loyalty / promo / gift-card holds release (mirrors OrderItemController::merge).
        if ($result['cancelled_source'] !== null) {
            $sourceOrder = $result['cancelled_source'];
            DB::afterCommit(function () use ($sourceOrder): void {
                OrderCancelled::dispatch(OrderCancelledData::fromOrder($sourceOrder));
            });
        }

        app(AuditLogService::class)->log(
            'table.merged',
            'RestaurantTable',
            $result['target_table']->id,
            [
                'source_status' => $result['old_source_status'],
                'target_status' => $result['old_target_status'],
            ],
            ['source_status' => 'available', 'target_status' => 'occupied'],
            ['source_table_id' => $result['source_table']->id],
            $request,
        );

        return response()->json([
            'target_order' => $this->findActiveOrder($result['target_table']->id)?->load(['items.modifiers']),
            'source_table' => $result['source_table']->fresh(),
            'target_table' => $result['target_table']->fresh(),
        ]);
    }

    public function split(SplitTableBillRequest $request, $tableId)
    {
        $table = RestaurantTable::findOrFail($tableId);
        $validated = $request->validated();
        $order = Order::with('items')->findOrFail($validated['order_id']);

        if ((int) $order->restaurant_table_id !== (int) $table->id) {
            return response()->json(['message' => 'Order does not belong to table.'], 422);
        }

        $service = app(OrderCreationService::class);

        if (!empty($validated['item_ids'])) {
            $splitOrder = $service->createFromPayload([
                'type' => 'dine_in',
                'restaurant_table_id' => $table->id,
                'items' => [],
                'print' => false,
            ], $request->user());

            // Scope strictly to this order to prevent stealing items from other orders
            OrderItem::where('order_id', $order->id)
                ->whereIn('id', $validated['item_ids'])
                ->update(['order_id' => $splitOrder->id]);

            $order = $service->recalculateTotals($order->fresh());
            $splitOrder = $service->recalculateTotals($splitOrder->fresh());

            app(AuditLogService::class)->log(
                'table.split_items',
                'Order',
                $order->id,
                [],
                $order->toArray(),
                ['split_order_id' => $splitOrder->id],
                $request,
            );

            return response()->json([
                'order' => $order,
                'split_order' => $splitOrder,
            ]);
        }

        $amount = (float) $validated['amount'];
        $splitOrder = $service->createFromPayload([
            'type' => 'dine_in',
            'restaurant_table_id' => $table->id,
            'items' => [],
            'print' => false,
        ], $request->user());

        OrderItem::create([
            'order_id' => $splitOrder->id,
            'item_id' => null,
            'variant_id' => null,
            'item_name' => 'Split Bill',
            'variant_name' => null,
            'quantity' => 1,
            'unit_price' => $amount,
            'total_price' => $amount,
            'notes' => null,
            'status' => 'pending',
        ]);

        $splitOrder = $service->recalculateTotals($splitOrder->fresh());

        app(AuditLogService::class)->log(
            'table.split_amount',
            'Order',
            $order->id,
            [],
            $order->toArray(),
            ['split_order_id' => $splitOrder->id, 'amount' => $amount],
            $request,
        );

        return response()->json([
            'order' => $order->fresh(['items.modifiers']),
            'split_order' => $splitOrder,
        ]);
    }

    private function findActiveOrder(int $tableId): ?Order
    {
        return RestaurantTable::findActiveOrder($tableId);
    }
}
