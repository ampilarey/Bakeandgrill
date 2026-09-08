<?php

declare(strict_types=1);

namespace App\Domains\Kitchen\Services;

use App\Domains\Kitchen\Support\PlanSlots;
use App\Models\Item;
use App\Models\Variant;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * What registered customers' buying says about demand — owner, 2026-09-08:
 * "is there anything that can be related to registered customers? their
 * buying and spending habits".
 *
 * Everything here is a share or a count. Registered customers are the
 * predictable part of demand: they come back, on their own days, at their
 * own hours, for the same things. Walk-ins are the swing. Knowing how much
 * of an item's sales the regulars account for tells the kitchen how firm
 * the floor under a forecast is.
 */
final class CustomerHabits
{
    public function __construct(private readonly SalesHistory $history) {}

    /**
     * @param array{slots: list<array{label: string, from: int, to: int}>}|null $settings
     * @return array<string, mixed>
     */
    public function summary(int $weeks, ?array $settings = null): array
    {
        $slots = PlanSlots::fromSettings($settings ?? PlanSlots::load());
        $tz = config('app.timezone');
        $today = Carbon::now($tz)->startOfDay();
        $to = $today->copy()->subDay();
        $from = $today->copy()->subWeeks($weeks);
        $fromDate = $from->toDateString();
        $toDate = $to->toDateString();

        $traffic = $this->history->orderTraffic($fromDate, $toDate, $slots);

        $orders = 0;
        $regOrders = 0;
        $revenue = 0.0;
        $regRevenue = 0.0;
        $byWeekday = array_fill(0, 7, ['orders' => 0, 'registered' => 0]);
        $bySlot = [];
        foreach ($slots->all() as $slot) {
            $bySlot[$slot['key']] = ['key' => $slot['key'], 'label' => $slot['label'], 'orders' => 0, 'registered' => 0];
        }

        foreach ($traffic as $date => $slotsOfDay) {
            $wd = Carbon::parse($date, $tz)->dayOfWeek;
            foreach ($slotsOfDay as $slotKey => $cell) {
                $orders += $cell['orders'];
                $regOrders += $cell['registered_orders'];
                $revenue += $cell['revenue'];
                $regRevenue += $cell['registered_revenue'];
                $byWeekday[$wd]['orders'] += $cell['orders'];
                $byWeekday[$wd]['registered'] += $cell['registered_orders'];
                if (isset($bySlot[$slotKey])) {
                    $bySlot[$slotKey]['orders'] += $cell['orders'];
                    $bySlot[$slotKey]['registered'] += $cell['registered_orders'];
                }
            }
        }

        $dayStart = $slots->dayStartHour();
        $perCustomer = DB::table('orders')
            ->where('status', 'completed')
            ->whereNull('deleted_at')
            ->whereNotNull('customer_id')
            ->where('created_at', '>=', $from->copy()->setTime($dayStart, 0))
            ->where('created_at', '<', $to->copy()->addDay()->setTime($dayStart, 0))
            ->selectRaw('customer_id, COUNT(*) as n')
            ->groupBy('customer_id')
            ->get();
        $buyers = $perCustomer->count();
        $repeat = $perCustomer->filter(fn ($r) => (int) $r->n >= 2)->count();

        $sales = $this->history->slotSales($fromDate, $toDate, $slots)['items'];
        $rows = $this->history->customerDailyRows($fromDate, $toDate, $slots);
        $regularWindow = $today->copy()->subWeeks(ProductionPlanner::REGULAR_WINDOW_WEEKS)->toDateString();

        $itemStats = [];
        foreach ($sales as $key => $perDay) {
            $total = 0.0;
            $registered = 0.0;
            foreach ($perDay as $slotsOfDay) {
                foreach ($slotsOfDay as $cell) {
                    $total += (float) $cell['qty'];
                    $registered += (float) $cell['registered'];
                }
            }
            if ($total < 5) {
                continue;
            }
            $regulars = 0;
            foreach ($rows[$key] ?? [] as $dates) {
                $weeks = [];
                foreach ($dates as $ds => $q) {
                    if ($ds >= $regularWindow) {
                        $weeks[Carbon::parse($ds)->format('o-W')] = true;
                    }
                }
                if (count($weeks) >= ProductionPlanner::REGULAR_MIN_WEEKS) {
                    $regulars++;
                }
            }
            $itemStats[$key] = [
                'key' => $key,
                'qty' => round($total, 1),
                'registered_share_pct' => round($registered / $total * 100),
                'buyers' => count($rows[$key] ?? []),
                'regulars' => $regulars,
            ];
        }
        uasort($itemStats, fn (array $a, array $b) => $b['qty'] <=> $a['qty']);
        $itemStats = array_slice($itemStats, 0, 15, true);

        $itemIds = [];
        $variantIds = [];
        foreach (array_keys($itemStats) as $key) {
            [$i, $v] = SalesHistory::splitKey($key);
            $itemIds[] = $i;
            if ($v > 0) {
                $variantIds[] = $v;
            }
        }
        $items = $itemIds === [] ? collect() : Item::query()->whereIn('id', $itemIds)->get()->keyBy('id');
        $variants = $variantIds === [] ? collect() : Variant::query()->whereIn('id', $variantIds)->get()->keyBy('id');

        $topItems = [];
        foreach ($itemStats as $key => $stat) {
            [$i, $v] = SalesHistory::splitKey($key);
            $item = $items->get($i);
            if (!$item) {
                continue;
            }
            $variant = $v > 0 ? $variants->get($v) : null;
            $stat['name'] = $variant ? $item->name . ' — ' . $variant->name : $item->name;
            $topItems[] = $stat;
        }

        $weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        $weekdayRows = [];
        foreach ($byWeekday as $wd => $cell) {
            $weekdayRows[] = [
                'weekday' => $weekdayNames[$wd],
                'orders' => $cell['orders'],
                'registered_share_pct' => $cell['orders'] > 0 ? round($cell['registered'] / $cell['orders'] * 100) : null,
            ];
        }
        $slotRows = [];
        foreach ($bySlot as $cell) {
            $slotRows[] = [
                'key' => $cell['key'],
                'label' => $cell['label'],
                'orders' => $cell['orders'],
                'registered_share_pct' => $cell['orders'] > 0 ? round($cell['registered'] / $cell['orders'] * 100) : null,
            ];
        }

        $walkInOrders = $orders - $regOrders;

        return [
            'weeks' => $weeks,
            'from' => $fromDate,
            'to' => $toDate,
            'orders' => [
                'total' => $orders,
                'registered' => $regOrders,
                'registered_share_pct' => $orders > 0 ? round($regOrders / $orders * 100) : null,
            ],
            'revenue' => [
                'total' => round($revenue, 2),
                'registered' => round($regRevenue, 2),
                'registered_share_pct' => $revenue > 0 ? round($regRevenue / $revenue * 100) : null,
            ],
            'average_ticket' => [
                'registered' => $regOrders > 0 ? round($regRevenue / $regOrders, 2) : null,
                'walk_in' => $walkInOrders > 0 ? round(($revenue - $regRevenue) / $walkInOrders, 2) : null,
            ],
            'buyers' => [
                'registered' => $buyers,
                'repeat' => $repeat,
                'repeat_share_pct' => $buyers > 0 ? round($repeat / $buyers * 100) : null,
                'orders_per_buyer' => $buyers > 0 ? round($regOrders / $buyers, 1) : null,
            ],
            'by_weekday' => $weekdayRows,
            'by_slot' => $slotRows,
            'top_items' => $topItems,
        ];
    }
}
