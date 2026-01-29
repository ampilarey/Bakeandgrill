<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    /**
     * Get current customer info
     */
    public function me(Request $request)
    {
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
}
