<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Orders;

use App\Http\Controllers\Controller;
use App\Models\Order;
use Illuminate\Http\JsonResponse;

class OrderTrackingController extends Controller
{
    /**
     * GET /api/orders/track/{token}
     *
     * Public order tracking — no authentication required.
     * Only exposes status and items, not customer PII.
     */
    public function trackByToken(string $token): JsonResponse
    {
        $order = Order::with(['items.modifiers'])
            ->where('tracking_token', $token)
            ->first();

        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        return response()->json([
            'order' => [
                'id' => $order->id,
                'order_number' => $order->order_number,
                'status' => $order->status,
                'payment_status' => $order->payment_status,
                'type' => $order->type,
                'subtotal' => $order->subtotal,
                'tax_amount' => $order->tax_amount,
                'promo_discount_laar' => $order->promo_discount_laar,
                'loyalty_discount_laar' => $order->loyalty_discount_laar,
                'gift_card_discount_laar' => $order->gift_card_discount_laar,
                'referral_discount_laar' => $order->referral_discount_laar,
                'delivery_fee' => $order->delivery_fee,
                'total' => $order->total,
                'paid_at' => $order->paid_at,
                'estimated_wait_minutes' => $order->estimated_wait_minutes,
                // Delivery info (customer already knows their own address)
                'delivery_address_line1' => $order->delivery_address_line1,
                'delivery_island' => $order->delivery_island,
                'delivery_contact_name' => $order->delivery_contact_name,
                'delivery_contact_phone' => $order->delivery_contact_phone,
                'items' => $order->items->map(fn ($item) => [
                    'id' => $item->id,
                    'item_name' => $item->item_name,
                    'variant_name' => $item->variant_name,
                    'packaging_option_name' => $item->packaging_option_name,
                    'quantity' => $item->quantity,
                    'unit_price' => (float) $item->unit_price,
                    'total_price' => (float) $item->total_price,
                    'notes' => $item->notes,
                    'modifiers' => $item->modifiers->map(fn ($m) => [
                        'id' => $m->id,
                        'name' => $m->modifier_name,
                        'modifier_name' => $m->modifier_name,
                        'modifier_price' => (float) $m->modifier_price,
                    ])->values(),
                ])->values(),
            ],
        ]);
    }
}
