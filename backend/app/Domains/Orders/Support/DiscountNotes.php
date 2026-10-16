<?php

declare(strict_types=1);

namespace App\Domains\Orders\Support;

/**
 * What a recalculation did to an order's discounts, kept for the request so
 * the endpoint that saved the ticket can tell the cashier (owner, 2026-10-16:
 * an offer that ended while the ticket was parked is dropped on the next
 * change, and the till must say so rather than quietly show a higher total).
 */
final class DiscountNotes
{
    /** @var array<int, list<string>> */
    private static array $notes = [];

    /** @param list<string> $notes */
    public static function add(int $orderId, array $notes): void
    {
        if ($notes === []) {
            return;
        }
        self::$notes[$orderId] = array_values(array_unique(array_merge(self::$notes[$orderId] ?? [], $notes)));
    }

    /** @return list<string> */
    public static function take(int $orderId): array
    {
        $notes = self::$notes[$orderId] ?? [];
        unset(self::$notes[$orderId]);

        return $notes;
    }
}
