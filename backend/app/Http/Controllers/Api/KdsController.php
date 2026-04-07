<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\Events\OrderPaid;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class KdsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        // 'paid' = online orders received but not yet started by kitchen
        // 'ready' = cooked and waiting for pickup/delivery
        $allowed  = ['pending', 'in_progress', 'paid', 'ready'];
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
            if (!in_array($order->status, ['pending', 'paid'], true)) {
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

            if (!in_array($order->status, ['pending', 'in_progress', 'paid', 'ready'], true)) {
                return ['error' => 'Order cannot be bumped.'];
            }

            $oldStatus = $order->status;

            // State machine: pending/paid/in_progress → ready; ready → completed
            $newStatus = $oldStatus === 'ready' ? 'completed' : 'ready';

            $order->update([
                'status'       => $newStatus,
                'completed_at' => $newStatus === 'completed' ? now() : null,
            ]);

            app(AuditLogService::class)->log(
                $newStatus === 'completed' ? 'order.completed' : 'order.ready',
                'Order', $order->id,
                ['status' => $oldStatus], ['status' => $newStatus],
                ['source' => 'kds'], $request,
            );

            // If the order wasn't already paid (edge case: KDS-only flow), fire OrderPaid
            if ($newStatus === 'completed' && $oldStatus !== 'paid') {
                DB::afterCommit(function () use ($order): void {
                    OrderPaid::dispatch(OrderPaidData::fromOrder($order->fresh(), false));
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
            if (!in_array($order->status, ['ready', 'completed'], true)) {
                return ['error' => 'Only ready or completed orders can be recalled.'];
            }

            $oldStatus = $order->status;
            // Recall from ready → back to in_progress; recall from completed → in_progress
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
