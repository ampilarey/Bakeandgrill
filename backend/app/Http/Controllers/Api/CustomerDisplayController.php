<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Provides a read-only order summary for customer-facing display screens.
 * No authentication required — orders are accessed by their public order_number,
 * which is a low-entropy identifier safe for display purposes.
 */
class CustomerDisplayController extends Controller
{
    /**
     * Get the current in-progress order for a POS device.
     * Used by customer display screens to show items, totals, and status.
     */
    public function show(Request $request, string $orderNumber): JsonResponse
    {
        $order = Order::with(['items' => function ($q) {
            $q->select('id', 'order_id', 'item_name', 'quantity', 'unit_price', 'total_price', 'notes');
        }])
        ->where('order_number', $orderNumber)
        ->whereIn('status', ['pending', 'open', 'preparing', 'ready'])
        ->select('id', 'order_number', 'status', 'type', 'subtotal', 'tax', 'discount', 'tip', 'total', 'created_at')
        ->firstOrFail();

        return response()->json([
            'order' => [
                'order_number' => $order->order_number,
                'status'       => $order->status,
                'type'         => $order->type,
                'items'        => $order->items->map(fn ($i) => [
                    'name'       => $i->item_name,
                    'quantity'   => $i->quantity,
                    'unit_price' => $i->unit_price,
                    'total'      => $i->total_price,
                    'notes'      => $i->notes,
                ]),
                'subtotal' => $order->subtotal,
                'tax'      => $order->tax,
                'discount' => $order->discount,
                'tip'      => $order->tip,
                'total'    => $order->total,
            ],
        ]);
    }
}
