<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

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

        return response()->json([
            'tables' => $query->orderBy('name')->get(),
        ]);
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
        $table = RestaurantTable::findOrFail($id);
        if (!$table->is_active) {
            return response()->json(['message' => 'Table is inactive.'], 422);
        }

        $activeOrder = $this->findActiveOrder($table->id);
        if ($activeOrder) {
            return response()->json([
                'message' => 'Table already has an open order.',
                'order_id' => $activeOrder->id,
            ], 422);
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

        app(AuditLogService::class)->log(
            'table.opened',
            'RestaurantTable',
            $table->id,
            ['status' => $oldStatus],
            ['status' => 'occupied'],
            ['order_id' => $order->id],
            $request,
        );

        return response()->json(['order' => $order, 'table' => $table], 201);
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
        $table->update(['status' => 'available']);

        app(AuditLogService::class)->log(
            'table.closed',
            'RestaurantTable',
            $table->id,
            ['status' => $oldStatus],
            ['status' => 'available'],
            [],
            $request,
        );

        return response()->json(['table' => $table]);
    }

    public function merge(MergeTablesRequest $request)
    {
        $validated = $request->validated();
        $sourceTable = RestaurantTable::findOrFail($validated['source_table_id']);
        $targetTable = RestaurantTable::findOrFail($validated['target_table_id']);
        $oldSourceStatus = $sourceTable->status;
        $oldTargetStatus = $targetTable->status;

        if ($sourceTable->id === $targetTable->id) {
            return response()->json(['message' => 'Select two different tables.'], 422);
        }

        $sourceOrder = $this->findActiveOrder($sourceTable->id);
        if (!$sourceOrder) {
            return response()->json(['message' => 'No active order on source table.'], 422);
        }

        $targetOrder = $this->findActiveOrder($targetTable->id);
        $service = app(OrderCreationService::class);

        DB::transaction(function () use (
            $sourceOrder,
            $targetOrder,
            $sourceTable,
            $targetTable,
            $service
        ) {
            if ($targetOrder) {
                OrderItem::where('order_id', $sourceOrder->id)
                    ->update(['order_id' => $targetOrder->id]);

                $service->recalculateTotals($targetOrder->fresh());
                $sourceOrder->update(['status' => 'cancelled']);
            } else {
                $sourceOrder->update(['restaurant_table_id' => $targetTable->id]);
            }

            $sourceTable->update(['status' => 'available']);
            $targetTable->update(['status' => 'occupied']);
        });

        app(AuditLogService::class)->log(
            'table.merged',
            'RestaurantTable',
            $targetTable->id,
            ['source_status' => $oldSourceStatus, 'target_status' => $oldTargetStatus],
            ['source_status' => 'available', 'target_status' => 'occupied'],
            ['source_table_id' => $sourceTable->id],
            $request,
        );

        return response()->json([
            'target_order' => $this->findActiveOrder($targetTable->id)?->load(['items.modifiers']),
            'source_table' => $sourceTable->fresh(),
            'target_table' => $targetTable->fresh(),
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
        return Order::where('restaurant_table_id', $tableId)
            ->whereIn('status', [
                'pending',
                'in_progress',
                'held',
                'partial',
                'confirmed',
                'preparing',
                'ready',
            ])
            ->latest('id')
            ->first();
    }
}
