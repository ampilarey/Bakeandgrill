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

        $orders = Order::with(['items.modifiers', 'items.item:id,menu_group_id,prep_time_minutes,is_available'])
            ->whereIn('status', $statuses)
            ->orderBy('created_at')
            ->get()
            ->map(fn (Order $order) => $this->formatOrder($order));

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

    /** @return array<string, mixed> */
    private function formatOrder(Order $order): array
    {
        $data = $order->toArray();
        $data['items'] = $order->items->map(function ($line) {
            $row = $line->toArray();
            $row['menu_group_id'] = $line->item?->menu_group_id;
            $row['prep_time_minutes'] = $line->item?->prep_time_minutes;
            unset($row['item']);

            return $row;
        })->values()->all();

        return $data;
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

            return ['order' => $order];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json(['order' => $result['order']]);
    }

    public function bump(Request $request, int $id): JsonResponse
    {
        $result = DB::transaction(function () use ($id, $request) {
            // Re-fetch with a row lock inside the transaction to prevent duplicate bumps
            $order = Order::lockForUpdate()->findOrFail($id);

            // Marking-ready is now POS-only — the cashier owns the
            // "tell the customer it's ready" call so the SMS chain
            // can't fire without someone looking at the till.
            // Kitchen can still clear ready tickets off their screen
            // by bumping ready → completed (post-handoff bookkeeping).
            //
            // Anything else (pending/in_progress/paid → ready) is
            // refused here so a stale KDS terminal can't backdoor
            // the customer-notification SMS. The cashier hits
            // "Mark ready" in POS → POST /orders/{id}/mark-ready
            // → OrderStatusChanged → existing "Ready for pickup!"
            // SMS listener fires exactly once.
            if ($order->status !== 'ready') {
                return ['error' => 'Marking ready is now handled by the cashier from POS. Tell the cashier the order is up.'];
            }

            $targetStatus = 'completed';
            $machine = app(OrderStatusMachine::class);
            if (!$machine->isAllowed($order->status, $targetStatus)) {
                return ['error' => 'Order cannot be bumped.'];
            }

            // Belt-and-braces payment guard for online-pickup orders
            // ONLY. Online pickup is the only flow where the customer
            // has already paid before the order reaches the kitchen
            // (via the online ordering app + BML webhook). If
            // payment_status is still unpaid here it means the webhook
            // hasn't confirmed yet, so completing the order would
            // wrongly fire loyalty points / completion notifications
            // for a payment that hasn't actually settled.
            //
            // Takeaway / delivery are EXCLUDED — those are legitimate
            // cash-on-pickup / pay-at-door flows. Dine-in is excluded —
            // pay-after-meal is the whole model.
            if ($order->type === 'online_pickup'
                && $order->payment_status !== 'paid'
                && $order->status !== 'paid') {
                return ['error' => 'Online order payment not yet confirmed — wait for webhook before completing.'];
            }

            $oldStatus = $order->status;

            // State machine (KDS-side, after the POS-only readiness
            // pivot): only ready → completed remains here.
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

            // Kitchen reached the terminal "completed" state.
            // Fire OrderCompleted (earns loyalty points + webhook) — NOT OrderPaid.
            //
            // Historical bug: this used to dispatch OrderPaid whenever $oldStatus
            // wasn't already 'paid', which fired the payment-confirmation SMS,
            // consumed loyalty holds, recorded referrals, and emitted webhooks
            // claiming the order was paid — all on tickets that hadn't been
            // settled yet (cash-on-pickup, dine-in pay-at-end, etc.).
            //
            // Payment-time listeners are owned by PaymentConfirmedListener →
            // OrderPaid, which still fires correctly when payment is actually
            // taken. The KDS path stays purely about kitchen completion.
            if ($newStatus === 'completed') {
                $orderForEvent = $order->fresh();
                DB::afterCommit(function () use ($orderForEvent): void {
                    OrderCompleted::dispatch(OrderCompletedData::fromOrder($orderForEvent));
                });
            }

            return ['order' => $order];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json(['order' => $result['order']]);
    }

    public function recall(Request $request, int $id): JsonResponse
    {
        $result = DB::transaction(function () use ($id, $request) {
            $order = Order::lockForUpdate()->findOrFail($id);

            // Route recall through the state machine so the transition is
            // whitelisted in one place. The machine permits
            // ready→in_progress and completed→in_progress.
            $machine = app(OrderStatusMachine::class);
            if (!$machine->isAllowed($order->status, 'in_progress')) {
                return ['error' => 'Only ready or completed orders can be recalled.'];
            }

            $oldStatus = $order->status;
            $order->update(['status' => 'in_progress', 'completed_at' => null]);
            app(AuditLogService::class)->log('order.recalled', 'Order', $order->id, ['status' => $oldStatus], ['status' => 'in_progress'], ['source' => 'kds'], $request);

            return ['order' => $order];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json(['order' => $result['order']]);
    }
}
