<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Order;
use Illuminate\Http\Response;
use Illuminate\View\View;

/**
 * Server-rendered order tracking for SMS links.
 *
 * React + service-worker routing proved unreliable on mobile SMS in-app
 * browsers, so /order/track/{token} is served as plain HTML from Laravel.
 */
class OrderTrackPageController extends Controller
{
    public function show(string $token): View|Response
    {
        $order = Order::with(['items'])
            ->where('tracking_token', $token)
            ->first();

        if (!$order) {
            return response()->view('order-track-missing', [], 404);
        }

        $statusLabels = [
            'payment_pending' => 'Awaiting payment',
            'pending' => 'Order confirmed',
            'paid' => 'Order confirmed',
            'partial' => 'Partially paid',
            'in_progress' => 'Being prepared',
            'preparing' => 'Being prepared',
            'ready' => 'Ready for pickup',
            'held' => 'On hold',
            'completed' => 'Completed',
            'delivered' => 'Delivered',
            'cancelled' => 'Cancelled',
            'refunded' => 'Refunded',
        ];

        $statusLabel = $statusLabels[$order->status] ?? ucfirst(str_replace('_', ' ', (string) $order->status));
        $isActive = !in_array($order->status, ['completed', 'cancelled', 'refunded', 'delivered'], true);

        return view('order-track', [
            'order' => $order,
            'statusLabel' => $statusLabel,
            'isActive' => $isActive,
        ]);
    }
}
