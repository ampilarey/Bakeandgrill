<?php

declare(strict_types=1);

namespace App\Domains\Marketing\Listeners;

use App\Domains\Orders\Events\OrderRefunded;
use App\Models\DailySpecial;
use App\Models\OrderItem;
use App\Services\SpecialPricingService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\DB;

/**
 * Decrements daily_specials.sold_count when a paid order is refunded.
 */
class DecrementDailySpecialSoldCountListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

    public int $tries = 3;

    public int $backoff = 5;

    public function __construct(private SpecialPricingService $pricing) {}

    public function handle(OrderRefunded $event): void
    {
        $orderId = $event->data->orderId;
        $ratio = max(0.0, min(1.0, $event->data->refundRatio));

        if ($ratio <= 0) {
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
