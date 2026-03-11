<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;

class WaitTimeController extends Controller
{
    /**
     * Returns the estimated current wait time in minutes,
     * based on orders in the kitchen queue (pending/preparing).
     */
    public function estimate(): JsonResponse
    {
        $activeOrders = Order::whereIn('status', ['pending', 'paid', 'preparing'])
            ->where('created_at', '>=', now()->subHours(2))
            ->count();

        // Base: 5 min per order in queue, minimum 5, maximum 45
        $estimated = min(45, max(5, $activeOrders * 5));

        return response()->json([
            'wait_minutes' => $estimated,
            'queue_depth'  => $activeOrders,
        ]);
    }
}
