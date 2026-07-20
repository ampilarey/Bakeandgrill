<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\PreOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PreOrderApiController extends Controller
{
    /**
     * Historical pre-order list (read-only). Create flow retired — use POST /api/customer/event-orders.
     */
    public function index(Request $request): JsonResponse
    {
        $customer = $request->user();

        // Defensive: EnsureCustomerToken middleware already enforces this.
        if (!$customer instanceof Customer) {
            return response()->json(['message' => 'Forbidden — customer access only.'], 403);
        }

        $preOrders = PreOrder::where('customer_id', $customer->id)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get();

        return response()->json(['data' => $preOrders]);
    }
}
