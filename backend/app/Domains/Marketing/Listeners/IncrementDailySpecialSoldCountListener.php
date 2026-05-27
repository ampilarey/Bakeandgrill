<?php

declare(strict_types=1);

namespace App\Domains\Marketing\Listeners;

use App\Domains\Orders\Events\OrderPaid;
use App\Models\DailySpecial;
use App\Models\OrderItem;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\DB;

/**
 * Increments daily_specials.sold_count for each paid line that had a special applied.
 */
class IncrementDailySpecialSoldCountListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

    public int $tries = 3;

    public int $backoff = 5;

    public function handle(OrderPaid $event): void
    {
        $orderId = $event->data->orderId;

        $counts = OrderItem::query()
            ->where('order_id', $orderId)
            ->whereNotNull('daily_special_id')
            ->select('daily_special_id', DB::raw('SUM(quantity) as qty'))
            ->groupBy('daily_special_id')
            ->pluck('qty', 'daily_special_id');

        foreach ($counts as $specialId => $qty) {
            DailySpecial::whereKey($specialId)->increment('sold_count', (int) $qty);
        }
    }
}
