<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Provides a read-only order summary for customer-facing display screens.
 * No authentication required — orders are accessed by their non-guessable
 * tracking_token (32-char random, set on order creation) rather than the
 * sequential order_number to prevent enumeration of in-progress orders.
 */
class CustomerDisplayController extends Controller
{
    /**
     * Get the current in-progress order for a customer display screen.
     *
     * Route parameter: {token} — the order's tracking_token (opaque, high-entropy).
     * Used by customer display screens to show items, totals, and status.
     */
    public function show(Request $request, string $token): JsonResponse
    {
        $order = Order::with(['items' => function ($q) {
            $q->select('id', 'order_id', 'item_name', 'quantity', 'unit_price', 'total_price', 'notes');
        }])
            ->where('tracking_token', $token)
            ->whereIn('status', ['pending', 'open', 'preparing', 'ready'])
            ->select('id', 'order_number', 'tracking_token', 'status', 'type', 'subtotal', 'tax_amount', 'discount_amount', 'tip_amount', 'total', 'created_at')
            ->firstOrFail();

        return response()->json([
            'order' => [
                'order_number' => $order->order_number,
                'status' => $order->status,
                'type' => $order->type,
                'items' => $order->items->map(fn ($i) => [
                    'name' => $i->item_name,
                    'quantity' => $i->quantity,
                    'unit_price' => $i->unit_price,
                    'total' => $i->total_price,
                    'notes' => $i->notes,
                ]),
                'subtotal' => $order->subtotal,
                'tax' => $order->tax_amount,
                'discount' => $order->discount_amount,
                'tip' => $order->tip_amount,
                'total' => $order->total,
            ],
        ]);
    }
}
