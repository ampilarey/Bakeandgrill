<?php

declare(strict_types=1);

namespace App\Domains\Marketing\Listeners;

use App\Domains\Orders\Events\OrderPaid;
use App\Models\DailySpecial;
use App\Models\OrderItem;
use App\Services\SpecialPricingService;
use Illuminate\Support\Facades\DB;

/**
 * Increments daily_specials.sold_count for each paid line that had a special applied.
 *
 * Synchronous after commit so capacity (sold_count + unpaid holds) stays accurate
 * the moment payment lands — queued increment allowed oversell of capped specials.
 */
class IncrementDailySpecialSoldCountListener
{
    public bool $afterCommit = true;

    public function __construct(private SpecialPricingService $pricing) {}

    public function handle(OrderPaid $event): void
    {
        $orderId = $event->data->orderId;

        $inserted = DB::table('daily_special_sold_count_logs')->insertOrIgnore([
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
            DailySpecial::whereKey($specialId)->increment('sold_count', (int) $qty);
        }

        $this->pricing->bustCache();
    }
}
