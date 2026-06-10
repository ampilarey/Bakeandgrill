<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Orders;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OrderCustomerController extends Controller
{
    /**
     * PATCH /api/orders/{id}/customer
     *
     * Link, change, or remove the customer on an open order — used when
     * a paid pickup ticket is opened view-only at the counter and the
     * cashier needs to attach a phone for receipt SMS / handover.
     */
    public function updateCustomer(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $request->validate([
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
        ]);

        $order = Order::with('customer')->findOrFail($id);

        if (in_array($order->status, ['completed', 'cancelled', 'refunded'], true)) {
            return response()->json(['message' => 'Cannot change customer on a closed order.'], 422);
        }

        $before = $order->customer_id;
        $order->update(['customer_id' => $request->input('customer_id')]);

        app(AuditLogService::class)->log(
            'order.customer_updated',
            'Order',
            $order->id,
            ['customer_id' => $before],
            ['customer_id' => $order->customer_id],
            [],
            $request,
        );

        return response()->json([
            'order' => $order->fresh(['customer:id,name,phone,loyalty_points,sms_opt_out']),
        ]);
    }
}
