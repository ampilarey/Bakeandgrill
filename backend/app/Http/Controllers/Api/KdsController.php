<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Orders\DTOs\OrderCompletedData;
use App\Domains\Orders\Events\OrderCompleted;
use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Services\AuditLogService;
use App\Services\OrderStatusMachine;
use App\Services\PrintJobService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class KdsController extends Controller
{
    /**
     * Canonical list of statuses the kitchen needs to see. Shared with
     * KdsStreamProvider so the REST list endpoint and the SSE stream
     * agree — previously these diverged (REST had 'ready'/no 'preparing',
     * SSE had 'preparing'/no 'ready') and tickets flickered or vanished
     * on the kitchen display.
     *
     * 'paid'      — online orders received but not yet started
     * 'partial'   — split-tender order, first leg taken but still cooking
     *               (CRITICAL: without this, taking a cash deposit on
     *                a dine-in ticket hid it from the kitchen)
     * 'preparing' — alias used by the customer-facing display + some
     *               POS flows; SSE used to use this exclusively
     * 'ready'     — cooked, waiting for pickup/delivery handoff
     */
    public const KDS_STATUSES = ['pending', 'in_progress', 'paid', 'partial', 'preparing', 'ready'];

    public function index(Request $request): JsonResponse
    {
        $allowed = self::KDS_STATUSES;
        $statuses = $request->query('status')
            ? array_intersect(explode(',', $request->query('status')), $allowed)
            : $allowed;

        if (empty($statuses)) {
            $statuses = $allowed;
        }

        $orders = Order::with([
            'items.modifiers',
            'items.item:id,menu_group_id,prep_time_minutes,is_available',
            'table:id,number,label',
            'kitchenDoneBy:id,name',
        ])
            ->whereIn('status', $statuses)
            ->orderBy('created_at')
            ->get()
            ->map(fn (Order $order) => $this->formatKitchenOrder($order));

        return response()->json(['orders' => $orders]);
    }

    public function menuGroups(): JsonResponse
    {
        $groups = MenuGroup::query()
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get(['id', 'name']);

        return response()->json(['data' => $groups]);
    }

    public function toggleItemAvailability(int $itemId): JsonResponse
    {
        $item = Item::findOrFail($itemId);
        $item->update(['is_available' => !$item->is_available]);

        return response()->json([
            'message' => 'Item availability updated',
            'item' => [
                'id' => $item->id,
                'is_available' => (bool) $item->is_available,
            ],
        ]);
    }

    /** Kitchen-safe order payload — no financial or payment fields. */
    public static function formatKitchenOrder(Order $order): array
    {
        $tableLabel = $order->ticket_name
            ?? $order->table?->label
            ?? $order->table?->number
            ?? null;

        $payload = [
            'id' => $order->id,
            'order_number' => $order->order_number,
            'type' => $order->type,
            'status' => $order->status,
            'table_number' => $tableLabel,
            'ticket_name' => $order->ticket_name,
            'notes' => $order->notes,
            'customer_notes' => $order->customer_notes,
            'created_at' => $order->created_at?->toIso8601String(),
            'updated_at' => $order->updated_at?->toIso8601String(),
            'kitchen_done_at' => $order->kitchen_done_at?->toIso8601String(),
            'kitchen_done_by' => $order->kitchenDoneBy ? [
                'id' => $order->kitchenDoneBy->id,
                'name' => $order->kitchenDoneBy->name,
            ] : null,
            'items' => $order->items->map(function ($line) {
                return [
                    'id' => $line->id,
                    'item_id' => $line->item_id,
                    'item_name' => $line->item_name,
                    'variant_name' => $line->variant_name,
                    'quantity' => $line->quantity,
                    'notes' => $line->notes,
                    'status' => $line->status,
                    'menu_group_id' => $line->item?->menu_group_id,
                    'prep_time_minutes' => $line->item?->prep_time_minutes,
                    'modifiers' => $line->modifiers->map(fn ($m) => [
                        'id' => $m->id,
                        'modifier_name' => $m->modifier_name,
                    ])->values()->all(),
                ];
            })->values()->all(),
        ];

        if ($order->type === 'delivery') {
            $payload['delivery_summary'] = implode(', ', array_filter([
                $order->delivery_contact_name,
                $order->delivery_address_line1,
                $order->delivery_island,
            ]));
            $payload['delivery_island'] = $order->delivery_island;
        }

        return $payload;
    }

    public function start(Request $request, int $id): JsonResponse
    {
        $result = DB::transaction(function () use ($id, $request) {
            $order = Order::lockForUpdate()->findOrFail($id);
            $machine = app(OrderStatusMachine::class);
            if (!$machine->isAllowed($order->status, 'in_progress')) {
                return ['error' => 'Only pending or paid orders can be started.'];
            }

            $oldStatus = $order->status;
            $order->update(['status' => 'in_progress']);
            app(AuditLogService::class)->log('order.started', 'Order', $order->id, ['status' => $oldStatus], ['status' => 'in_progress'], ['source' => 'kds'], $request);

            return ['order' => $order->fresh(['items.modifiers', 'items.item', 'table', 'kitchenDoneBy'])];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json(['order' => self::formatKitchenOrder($result['order'])]);
    }

    public function kitchenDone(Request $request, int $id): JsonResponse
    {
        $result = DB::transaction(function () use ($id, $request) {
            $order = Order::lockForUpdate()->findOrFail($id);

            if (!in_array($order->status, ['in_progress', 'preparing'], true)) {
                return ['error' => 'Only in-progress orders can be marked kitchen done.'];
            }

            if ($order->kitchen_done_at !== null) {
                return ['order' => $order->fresh(['items.modifiers', 'items.item', 'table', 'kitchenDoneBy'])];
            }

            $userId = $request->user()?->id;
            $order->update([
                'kitchen_done_at' => now(),
                'kitchen_done_by' => $userId,
            ]);

            app(AuditLogService::class)->log(
                'order.kitchen_done',
                'Order',
                $order->id,
                ['kitchen_done_at' => null],
                ['kitchen_done_at' => $order->fresh()->kitchen_done_at?->toIso8601String()],
                ['source' => 'kds', 'user_id' => $userId],
                $request,
            );

            return ['order' => $order->fresh(['items.modifiers', 'items.item', 'table', 'kitchenDoneBy'])];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json(['order' => self::formatKitchenOrder($result['order'])]);
    }

    public function printTicket(Request $request, int $id): JsonResponse
    {
        $order = Order::with(['items.modifiers'])->findOrFail($id);
        app(PrintJobService::class)->enqueueKitchen($order, 'kds_reprint');

        app(AuditLogService::class)->log(
            'kitchen.print_ticket',
            'Order',
            $order->id,
            [],
            ['reason' => 'kds_reprint'],
            ['source' => 'kds'],
            $request,
        );

        return response()->json(['message' => 'Kitchen ticket queued for printing.']);
    }

    public function bump(Request $request, int $id): JsonResponse
    {
        $result = DB::transaction(function () use ($id, $request) {
            // Re-fetch with a row lock inside the transaction to prevent duplicate bumps
            $order = Order::lockForUpdate()->findOrFail($id);

            if ($order->status !== 'ready') {
                return ['error' => 'Marking ready is now handled by the cashier from POS. Tell the cashier the order is up.'];
            }

            $targetStatus = 'completed';
            $machine = app(OrderStatusMachine::class);
            if (!$machine->isAllowed($order->status, $targetStatus)) {
                return ['error' => 'Order cannot be bumped.'];
            }

            if ($order->type === 'online_pickup'
                && $order->payment_status !== 'paid'
                && $order->status !== 'paid') {
                return ['error' => 'Online order payment not yet confirmed — wait for webhook before completing.'];
            }

            $oldStatus = $order->status;
            $newStatus = $targetStatus;

            $order->update([
                'status' => $newStatus,
                'completed_at' => $newStatus === 'completed' ? now() : null,
            ]);

            app(AuditLogService::class)->log(
                $newStatus === 'completed' ? 'order.completed' : 'order.ready',
                'Order',
                $order->id,
                ['status' => $oldStatus],
                ['status' => $newStatus],
                ['source' => 'kds'],
                $request,
            );

            if ($newStatus === 'completed') {
                $orderForEvent = $order->fresh();
                DB::afterCommit(function () use ($orderForEvent): void {
                    OrderCompleted::dispatch(OrderCompletedData::fromOrder($orderForEvent));
                });
            }

            return ['order' => $order->fresh(['items.modifiers', 'items.item', 'table', 'kitchenDoneBy'])];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json(['order' => self::formatKitchenOrder($result['order'])]);
    }

    public function recall(Request $request, int $id): JsonResponse
    {
        $result = DB::transaction(function () use ($id, $request) {
            $order = Order::lockForUpdate()->findOrFail($id);

            $machine = app(OrderStatusMachine::class);
            if (!$machine->isAllowed($order->status, 'in_progress')) {
                return ['error' => 'Only ready or completed orders can be recalled.'];
            }

            $oldStatus = $order->status;
            $order->update([
                'status' => 'in_progress',
                'completed_at' => null,
                'kitchen_done_at' => null,
                'kitchen_done_by' => null,
            ]);
            app(AuditLogService::class)->log('order.recalled', 'Order', $order->id, ['status' => $oldStatus], ['status' => 'in_progress'], ['source' => 'kds'], $request);

            return ['order' => $order->fresh(['items.modifiers', 'items.item', 'table', 'kitchenDoneBy'])];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json(['order' => self::formatKitchenOrder($result['order'])]);
    }
}
