<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Orders\DTOs\OrderCompletedData;
use App\Domains\Orders\Events\OrderCompleted;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\AuditLogService;
use App\Services\OrderStatusMachine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class KdsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        // 'paid' = online orders received but not yet started by kitchen
        // 'ready' = cooked and waiting for pickup/delivery
        $allowed = ['pending', 'in_progress', 'paid', 'ready'];
        $statuses = $request->query('status')
            ? array_intersect(explode(',', $request->query('status')), $allowed)
            : $allowed;

        if (empty($statuses)) {
            $statuses = $allowed;
        }

        $orders = Order::with(['items.modifiers'])
            ->whereIn('status', $statuses)
            ->orderBy('created_at')
            ->get();

        return response()->json(['orders' => $orders]);
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
