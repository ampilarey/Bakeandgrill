<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\CustomerSmsOptOutRequest;
use App\Models\Customer;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    /**
     * Get current customer info
     */
    public function me(Request $request)
    {
        // SECURITY: Ensure this is a customer token, not staff
        if (!$request->user()->tokenCan('customer')) {
            return response()->json(['message' => 'Forbidden - customer access only'], 403);
        }

        $customer = $request->user();

        return response()->json([
            'customer' => [
                'id' => $customer->id,
                'phone' => $customer->phone,
                'name' => $customer->name,
                'email' => $customer->email,
                'loyalty_points' => $customer->loyalty_points,
                'tier' => $customer->tier,
                'preferred_language' => $customer->preferred_language,
                'last_order_at' => $customer->last_order_at,
            ],
        ]);
    }

    /**
     * Get customer's order history
     */
    public function orders(Request $request)
    {
        $customer = $request->user();

        $orders = $customer->orders()
            ->with(['items', 'payments'])
            ->orderBy('created_at', 'desc')
            ->paginate(15);

        return response()->json($orders);
    }

    /**
     * GET /api/customer/orders/{id}
     * Single order detail — used by online order status page.
     */
    public function show(Request $request, int $id)
    {
        $customer = $request->user();

        $order = $customer->orders()
            ->with(['items.item', 'payments'])
            ->findOrFail($id);

        return response()->json([
            'order' => [
                'id'                        => $order->id,
                'order_number'              => $order->order_number,
                'status'                    => $order->status,
                'type'                      => $order->type,
                'total'                     => (float) $order->total,
                'subtotal'                  => (float) ($order->subtotal ?? $order->total),
                'delivery_fee'              => (float) ($order->delivery_fee ?? 0),
                'promo_discount_laar'       => (int) ($order->promo_discount_laar ?? 0),
                'loyalty_discount_laar'     => (int) ($order->loyalty_discount_laar ?? 0),
                'paid_at'                   => $order->paid_at?->toIso8601String(),
                'created_at'               => $order->created_at->toIso8601String(),
                // Delivery fields
                'delivery_address_line1'    => $order->delivery_address_line1,
                'delivery_address_line2'    => $order->delivery_address_line2,
                'delivery_island'           => $order->delivery_island,
                'delivery_contact_name'     => $order->delivery_contact_name,
                'delivery_contact_phone'    => $order->delivery_contact_phone,
                'delivery_notes'            => $order->delivery_notes,
            ],
        ]);
    }

    /**
     * Update customer profile
     */
    public function update(Request $request)
    {
        $customer = $request->user();

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'email' => 'sometimes|email|max:255',
            'preferred_language' => 'sometimes|in:en,dv,ar',
        ]);

        $customer->update($validated);

        return response()->json([
            'message' => 'Profile updated successfully',
            'customer' => $customer,
        ]);
    }

    /**
     * Opt out of SMS promotions.
     */
    public function optOut(CustomerSmsOptOutRequest $request)
    {
        $customer = Customer::where('phone', $request->validated()['phone'])->first();

        if (!$customer) {
            return response()->json(['message' => 'Customer not found.'], 404);
        }

        $customer->update([
            'sms_opt_out' => true,
            'sms_opt_out_at' => now(),
        ]);

        return response()->json(['message' => 'SMS opt-out confirmed.']);
    }
}
