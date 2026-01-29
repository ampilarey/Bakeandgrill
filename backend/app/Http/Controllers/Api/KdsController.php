<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\InventoryDeductionService;
use App\Services\AuditLogService;
use Illuminate\Http\Request;

class KdsController extends Controller
{
    public function index(Request $request)
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

    public function start($id)
    {
        $order = Order::findOrFail($id);
        if ($order->status !== 'pending') {
            return response()->json(['message' => 'Only pending orders can be started.'], 422);
        }

        $order->update(['status' => 'in_progress']);

        return response()->json(['order' => $order]);
    }

    public function bump($id)
    {
        $order = Order::findOrFail($id);
        if (!in_array($order->status, ['pending', 'in_progress'], true)) {
            return response()->json(['message' => 'Order cannot be bumped.'], 422);
        }

        $order->update([
            'status' => 'completed',
            'completed_at' => now(),
        ]);

        app(AuditLogService::class)->log(
            'order.completed',
            'Order',
            $order->id,
            ['status' => $order->getOriginal('status')],
            ['status' => 'completed'],
            ['source' => 'kds'],
            $request
        );

        try {
            app(InventoryDeductionService::class)->deductForOrder($order, $request->user()?->id);
        } catch (\Throwable $error) {
            report($error);
        }

        return response()->json(['order' => $order]);
    }

    public function recall($id)
    {
        $order = Order::findOrFail($id);
        if ($order->status !== 'completed') {
            return response()->json(['message' => 'Only completed orders can be recalled.'], 422);
        }

        $order->update([
            'status' => 'pending',
            'completed_at' => null,
        ]);

        return response()->json(['order' => $order]);
    }
}
