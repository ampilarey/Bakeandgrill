<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

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
        $statuses = $request->query('status')
            ? explode(',', $request->query('status'))
            : ['pending', 'in_progress'];

        $orders = Order::with(['items.modifiers'])
            ->whereIn('status', $statuses)
            ->orderBy('created_at')
            ->get();

        return response()->json(['orders' => $orders]);
    }

    public function start(Request $request, int $id): JsonResponse
    {
        $order = Order::findOrFail($id);
        if ($order->status !== 'pending') {
            return response()->json(['message' => 'Only pending orders can be started.'], 422);
        }

        $order->update(['status' => 'in_progress']);

        app(AuditLogService::class)->log('order.started', 'Order', $order->id, ['status' => 'pending'], ['status' => 'in_progress'], ['source' => 'kds'], $request);

        return response()->json(['order' => $order]);
    }

    public function bump(Request $request, int $id): JsonResponse
    {
        $order = Order::findOrFail($id);
        if (!in_array($order->status, ['pending', 'in_progress', 'paid'], true)) {
            return response()->json(['message' => 'Order cannot be bumped.'], 422);
        }

        $oldStatus = $order->status;

        DB::transaction(function () use ($order, $request, $oldStatus): void {
            $order->update([
                'status' => 'completed',
                'completed_at' => now(),
            ]);

            app(AuditLogService::class)->log('order.completed', 'Order', $order->id, ['status' => $oldStatus], ['status' => 'completed'], ['source' => 'kds'], $request);

            // If the order wasn't already paid (edge case: KDS-only flow), fire OrderPaid
            if ($oldStatus !== 'paid') {
                DB::afterCommit(function () use ($order): void {
                    OrderPaid::dispatch($order->fresh(['items.modifiers', 'payments']), false);
                });
            }
        });

        return response()->json(['order' => $order]);
    }

    public function recall(Request $request, int $id): JsonResponse
    {
        $order = Order::findOrFail($id);
        if ($order->status !== 'completed') {
            return response()->json(['message' => 'Only completed orders can be recalled.'], 422);
        }

        $order->update(['status' => 'pending', 'completed_at' => null]);

        app(AuditLogService::class)->log('order.recalled', 'Order', $order->id, ['status' => 'completed'], ['status' => 'pending'], ['source' => 'kds'], $request);

        return response()->json(['order' => $order]);
    }
}
