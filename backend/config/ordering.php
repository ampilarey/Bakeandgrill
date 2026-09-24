<?php

declare(strict_types=1);

return [
    /*
    | Minimum order value in MVR.
    | Set to 0 to disable. Dine-in orders are exempt.
    */
    'minimum_order_mvr' => (float) env('MINIMUM_ORDER_MVR', 0),

    /*
    | Minutes before a payment_pending order is auto-cancelled.
    */
    'payment_pending_ttl_minutes' => (int) env('PAYMENT_PENDING_TTL_MINUTES', 30),
    // When the bank's status API cannot be reached, keep an unpaid order this
    // long before cancelling it anyway (checkout audit, 2026-09-26).
    'payment_unknown_max_minutes' => (int) env('PAYMENT_UNKNOWN_MAX_MINUTES', 180),
];
