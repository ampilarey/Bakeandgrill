<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Orders;

use App\Domains\Payments\Services\PaymentService;
use App\Domains\System\Services\ServiceAvailabilityService;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

class OrderTrackingController extends Controller
{
    /**
     * GET /api/orders/track/{token}
     *
     * Public order tracking — no authentication required.
     *
     * The 32-character token is the credential. Whoever holds the link sees
     * status, items and totals. The delivery name, phone and street are only
     * included when the signed-in customer owns the order — the link is
     * forwarded and left in history.
     */
    public function trackByToken(string $token, PaymentService $payments): JsonResponse
    {
        $order = Order::with(['items.modifiers'])
            ->where('tracking_token', $token)
            ->first();

        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        $viewer = Auth::guard('customer')->user();
        $showDelivery = $viewer instanceof Customer && (int) $viewer->id === (int) $order->customer_id;

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
                'total_laar' => $order->total_laar,
                'remaining_balance_laar' => $payments->getRemainingBalanceLaar($order),
                'paid_at' => $order->paid_at,
                'estimated_wait_minutes' => $order->estimated_wait_minutes,
                'delivery_address_line1' => $showDelivery ? $order->delivery_address_line1 : null,
                'delivery_island' => $showDelivery ? $order->delivery_island : null,
                'delivery_contact_name' => $showDelivery ? $order->delivery_contact_name : null,
                'delivery_contact_phone' => $showDelivery ? $order->delivery_contact_phone : null,
                'items' => $order->items->map(fn ($item) => [
                    'id' => $item->id,
                    'item_id' => $item->item_id,
                    'parent_order_item_id' => $item->parent_order_item_id,
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

    /**
     * POST /api/orders/track/{token}/pay
     *
     * The tracking link is enough to pay the remaining balance. A guest who
     * abandoned the card page can finish without a new sign-in.
     */
    public function payByToken(string $token, PaymentService $payments): JsonResponse
    {
        app(ServiceAvailabilityService::class)->assertAvailable('online_payment');

        $order = Order::where('tracking_token', $token)->first();
        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        // Only an order placed online and still waiting for its card payment. Every
        // order has a tracking link, the till's too, and a till ticket that is open or
        // in the kitchen cannot move back to payment_pending (review, 2026-10-19).
        if ((string) $order->status !== 'payment_pending'
            || !in_array((string) $order->type, ['online_pickup', 'delivery', 'dine_in'], true)
            || (string) $order->payment_status === 'paid') {
            return response()->json(['message' => 'This order cannot be paid.'], 422);
        }

        $dueLaar = $payments->getRemainingBalanceLaar($order);
        if ($dueLaar <= 0) {
            return response()->json([
                'message' => 'Nothing to pay — this order is already fully covered.',
                'code' => 'zero_balance',
            ], 422);
        }

        try {
            $result = $payments->initiateBmlPayment($order, $dueLaar);
        } catch (\RuntimeException $e) {
            Log::error('Order track pay: BML initiation failed', [
                'order_id' => $order->id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Payment gateway unavailable. Please try again in a moment.',
                'code' => 'gateway_error',
            ], 503);
        }

        return response()->json([
            'payment_url' => $result['payment_url'],
            'payment_id' => $result['payment_id'],
        ]);
    }
}
