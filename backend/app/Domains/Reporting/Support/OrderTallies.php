<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Support;

use App\Models\CateringRequest;
use App\Models\Order;
use App\Models\TradeDelivery;
use Carbon\CarbonInterface;

/**
 * One definition of "how many orders has the business fulfilled", shared by
 * the admin dashboard and the public counters so they can never disagree.
 *
 * - Retail: every row in `orders` except cancelled (POS, pickup, delivery,
 *   dine-in, takeaway — all channels live in that table).
 * - Wholesale: trade deliveries that actually went out (dispatched /
 *   reconciled / invoiced / settled) — drafts and cancellations don't count.
 * - Catering: requests that became real business (confirmed / completed) —
 *   inquiries and open quotes don't count.
 */
final class OrderTallies
{
    private const WHOLESALE_STATUSES = [
        TradeDelivery::STATUS_DISPATCHED,
        TradeDelivery::STATUS_RECONCILED,
        TradeDelivery::STATUS_INVOICED,
        TradeDelivery::STATUS_SETTLED,
    ];

    private const CATERING_STATUSES = ['confirmed', 'completed'];

    public static function retail(?CarbonInterface $since = null): int
    {
        return Order::query()
            ->where('status', '!=', 'cancelled')
            ->when($since, fn ($q) => $q->where('created_at', '>=', $since))
            ->count();
    }

    public static function wholesale(?CarbonInterface $since = null): int
    {
        return TradeDelivery::query()
            ->whereIn('status', self::WHOLESALE_STATUSES)
            ->when($since, fn ($q) => $q->where('created_at', '>=', $since))
            ->count();
    }

    public static function catering(?CarbonInterface $since = null): int
    {
        return CateringRequest::query()
            ->whereIn('status', self::CATERING_STATUSES)
            ->when($since, fn ($q) => $q->where('created_at', '>=', $since))
            ->count();
    }

    public static function combined(?CarbonInterface $since = null): int
    {
        return self::retail($since) + self::wholesale($since) + self::catering($since);
    }
}
