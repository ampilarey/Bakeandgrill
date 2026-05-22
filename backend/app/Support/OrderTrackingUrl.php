<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Order;

/**
 * Public order-tracking links embedded in SMS / email.
 *
 * Uses /order/track/{tracking_token} (path-only) so mobile SMS clients
 * don't strip the ?tok= query param from legacy /orders/{id}?tok= links.
 */
final class OrderTrackingUrl
{
    public static function for(Order $order): string
    {
        $token = (string) $order->tracking_token;

        return rtrim((string) config('app.url'), '/') . '/order/track/' . $token;
    }
}
