<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Order;

/**
 * Public order-tracking links embedded in SMS / email.
 *
 * Path-only /order/track/{token} so mobile SMS clients don't strip query
 * params. Laravel serves the order SPA; React OrderStatusPage loads the
 * order via GET /api/orders/track/{token} (no login required).
 */
final class OrderTrackingUrl
{
    public static function for(Order $order): string
    {
        $token = (string) $order->tracking_token;

        return rtrim((string) config('app.url'), '/') . '/order/track/' . $token;
    }
}
