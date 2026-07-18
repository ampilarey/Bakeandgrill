<?php

declare(strict_types=1);

namespace App\Domains\Marketing\Listeners;

use App\Domains\Orders\Events\OrderRefunded;
use App\Models\DailySpecial;
use App\Models\OrderItem;
use App\Services\SpecialPricingService;
use Illuminate\Support\Facades\DB;

/**
 * Decrements daily_specials.sold_count when a paid order is refunded.
 *
 * Synchronous after commit; idempotent per refund_id so retries cannot double-decrement.
 */
class DecrementDailySpecialSoldCountListener
{
    public bool $afterCommit = true;

    public function __construct(private SpecialPricingService $pricing) {}

    public function handle(OrderRefunded $event): void
    {
        $orderId = $event->data->orderId;
        $refundId = $event->data->refundId;
        $ratio = max(0.0, min(1.0, $event->data->refundRatio));

        if ($ratio <= 0) {
            return;
        }

        $inserted = DB::table('daily_special_sold_count_refund_logs')->insertOrIgnore([
            'refund_id' => $refundId,
            'order_id' => $orderId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        if ($inserted === 0) {
            return;
        }

        $counts = OrderItem::query()
            ->where('order_id', $orderId)
            ->whereNotNull('daily_special_id')
            ->select('daily_special_id', DB::raw('SUM(quantity) as qty'))
            ->groupBy('daily_special_id')
            ->pluck('qty', 'daily_special_id');

        foreach ($counts as $specialId => $qty) {
            $decrement = (int) max(0, round((int) $qty * $ratio));
            if ($decrement === 0) {
                continue;
            }
            DailySpecial::whereKey($specialId)
                ->where('sold_count', '>=', $decrement)
                ->decrement('sold_count', $decrement);
        }

        $this->pricing->bustCache();
    }
}
