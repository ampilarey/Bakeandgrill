<?php

declare(strict_types=1);

namespace App\Domains\Delivery\Services;

use App\Models\Order;
use Carbon\Carbon;

/**
 * Ops audit, 2026-09-25. `delivery_eta_at` was set only when the customer
 * typed a desired time or staff edited the order, so most delivery orders
 * carried no promise: the tracking page had nothing to show and the
 * delay alert could only fall back to the kitchen's wait estimate. Every
 * delivery order now gets an ETA from the delivery time the owner
 * promises on the site ("30-45 min" reads as 45), stamped at creation and
 * again at dispatch if still empty.
 */
final class DeliveryEtaStamper
{
    public const DEFAULT_MINUTES = 45;

    public function __construct(private readonly DeliverySettingsService $settings) {}

    /** The promised delivery time in minutes: the largest number in the setting, or the default. */
    public function promisedMinutes(): int
    {
        $raw = $this->settings->deliveryTime();
        if ($raw !== '' && preg_match_all('/\d+/', $raw, $m) && $m[0] !== []) {
            $max = max(array_map('intval', $m[0]));
            if ($max > 0) {
                return min(24 * 60, $max);
            }
        }

        return self::DEFAULT_MINUTES;
    }

    /** Set the ETA when the order is a delivery and has none. Returns whether it was set. */
    public function stampIfMissing(Order $order, ?Carbon $from = null): bool
    {
        if ($order->type !== 'delivery' || $order->delivery_eta_at !== null) {
            return false;
        }
        $order->forceFill(['delivery_eta_at' => ($from ?? now())->copy()->addMinutes($this->promisedMinutes())])->save();

        return true;
    }
}
