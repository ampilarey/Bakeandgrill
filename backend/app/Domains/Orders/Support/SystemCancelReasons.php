<?php

declare(strict_types=1);

namespace App\Domains\Orders\Support;

/**
 * Why the system (not a person) cancelled an online order.
 *
 * Checkout audit, 2026-09-26: an order cancelled for non-payment may still be
 * paid a moment later — the bank's confirmation can arrive after the cleanup.
 * These reasons mark the orders that may be brought back when that happens;
 * an order a customer or staff member cancelled never is.
 */
final class SystemCancelReasons
{
    public const UNPAID_TIMEOUT = 'Unpaid — the payment window expired';

    public const PAYMENT_FAILED = 'Payment failed or was cancelled at the bank';

    public const ALL = [self::UNPAID_TIMEOUT, self::PAYMENT_FAILED];

    public static function isSystem(?string $reason): bool
    {
        return $reason !== null && in_array($reason, self::ALL, true);
    }
}
