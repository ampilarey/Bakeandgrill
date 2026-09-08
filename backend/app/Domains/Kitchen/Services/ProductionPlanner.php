<?php

declare(strict_types=1);

namespace App\Domains\Kitchen\Services;

use App\Domains\Kitchen\Support\PlanSlots;
use App\Domains\Kitchen\Support\WeightedStats;
use App\Models\Item;
use App\Models\ProductionPlanItem;
use App\Models\ProductionPlanRecord;
use App\Models\Variant;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * How many of each thing to make for a day, slot by slot.
 *
 * Owner, 2026-09-08: "for Friday evening we will need to make 50 bajiya" —
 * with the start, middle and end of the month selling differently, school
 * and office holidays moving sales, and the question of what registered
 * customers' habits can add.
 *
 * The method, per item and slot:
 *
 *   1. Take the last N same-weekday trading days (Fridays for a Friday).
 *      A day with no sales at all, or marked closed, is not a trading day.
 *   2. Bring each of those days onto a common footing by dividing its
 *      figure by what made that day special: its month position (learned
 *      from this item's own history) and any holiday kind it fell in
 *      (learned once a few have been seen, the owner's typed expectation
 *      until then).
 *   3. Where the item sold out during the slot, the figure is a floor, not
 *      the demand: lift it to at least the median of the days that did not
 *      sell out.
 *   4. Take a recency-weighted quantile at the item's service level — 85%
 *      means enough for 85 of every 100 such days — and scale it back up by
 *      the target day's own month position and holiday factors.
 *   5. Round up to the item's batch size; never plan below its floor or
 *      below what is already ordered for that day.
 */
final class ProductionPlanner
{
    /** A month-position ratio counts fully once this many days back it. */
    public const POSITION_SHRINK_DAYS = 6;

    /** A holiday-kind ratio counts fully once this many days back it. */
    public const KIND_SHRINK_DAYS = 4;

    /** Fewer trading days than this and the plan says so instead of guessing. */
    public const MIN_OPEN_DAYS = 7;

    /** A regular bought the item in at least this many distinct weeks … */
    public const REGULAR_MIN_WEEKS = 3;

    /** … out of the last this-many. */
    public const REGULAR_WINDOW_WEEKS = 8;

    public function __construct(
        private readonly SalesHistory $history,
        private readonly ProductionCalendar $calendar,
    ) {}

    /**
     * @param array{slots: list<array{label: string, from: int, to: int}>, lookback_weeks: int, sample_weeks: int, default_service_level_pct: int}|null $settings
     * @return array<string, mixed>
     */
    public function plan(string $dateStr, ?array $settings = null): array
    {
        $settings ??= PlanSlots::load();
        $slots = PlanSlots::fromSettings($settings);
        $tz = config('app.timezone');
        $target = Carbon::parse($dateStr, $tz)->startOfDay();
        $today = Carbon::now($tz)->startOfDay();
        $targetDate = $target->toDateString();

        $historyEnd = $target->copy()->subDay();
        $historyStart = $target->copy()->subWeeks((int) $settings['lookback_weeks']);
        $periods = $this->calendar->periodsBetween($historyStart->toDateString(), $targetDate);
        $closures = $this->calendar->closures();
        $targetInfo = $this->calendar->describe($targetDate, $periods, $closures);
        $position = ProductionCalendar::monthPosition($target);

        $out = [
            'date' => $targetDate,
            'weekday' => $target->format('l'),
            'is_today' => $target->equalTo($today),
            'is_past' => $target->lt($today),
            'month_position' => $position,
            'calendar' => array_map(fn (string $kind) => [
                'kind' => $kind,
                'label' => $targetInfo['labels'][$kind] ?? $kind,
                'expected_change_pct' => $targetInfo['expectations'][$kind] ?? null,
            ], $targetInfo['kinds']),
            'closed' => $targetInfo['closed'],
            'closed_reason' => $targetInfo['closed_reason'],
            'slots' => $slots->all(),
            'settings' => $settings,
            'history' => [
                'from' => $historyStart->toDateString(),
                'to' => $historyEnd->toDateString(),
                'open_days' => 0,
                'enough' => false,
            ],
            'items' => [],
        ];

        if ($targetInfo['closed']) {
            return $out;
        }

        $sales = $this->history->slotSales($historyStart->toDateString(), $historyEnd->toDateString(), $slots);
        $days = $this->tradingDays($historyStart, $historyEnd, $sales['days'], $periods, $closures);
        $out['history']['open_days'] = count($days);
        $out['history']['enough'] = count($days) >= self::MIN_OPEN_DAYS;

        $reviewing = $target->lte($today);
        $selloutEnd = $reviewing ? $targetDate : $historyEnd->toDateString();
        $sellouts = $this->history->selloutIntervals($historyStart->toDateString(), $selloutEnd);
        $known = $this->history->knownDemand($targetDate, $slots);
        $made = $reviewing ? $this->history->madeOn($targetDate) : [];
        $actual = $reviewing ? $this->history->slotSales($targetDate, $targetDate, $slots)['items'] : [];
        $customerRows = $this->history->customerDailyRows($historyStart->toDateString(), $historyEnd->toDateString(), $slots);

        /** @var Collection<string, ProductionPlanItem> $config */
        $config = ProductionPlanItem::query()->get()
            ->keyBy(fn (ProductionPlanItem $c) => SalesHistory::key((int) $c->item_id, (int) $c->variant_id));
        $saved = ProductionPlanRecord::query()->where('plan_date', $targetDate)->get()
            ->groupBy(fn (ProductionPlanRecord $r) => SalesHistory::key((int) $r->item_id, (int) $r->variant_id));

        $keys = array_values(array_unique(array_merge(
            array_keys($sales['items']),
            array_keys($known),
            $config->keys()->all(),
            array_keys($actual),
            $saved->keys()->all(),
        )));
        [$items, $variants] = $this->catalogue($keys);

        $sampleDates = $this->sampleDates($target, $historyStart, $days, (int) $settings['sample_weeks']);

        foreach ($keys as $key) {
            [$itemId, $variantId] = SalesHistory::splitKey($key);
            $item = $items->get($itemId);
            if (!$item) {
                continue;
            }
            $variant = $variantId > 0 ? $variants->get($variantId) : null;
            if ($variantId > 0 && !$variant) {
                continue;
            }
            $cfg = $config->get($key);
            $serviceLevel = (int) ($cfg?->service_level_pct ?? $settings['default_service_level_pct']);
            $roundTo = max(1, (int) ($cfg?->round_to ?? 1));
            $minQty = (int) ($cfg?->min_qty ?? 0);

            $perDay = $sales['items'][$key] ?? [];
            $forecast = $this->forecastItem(
                $perDay,
                $days,
                $sampleDates,
                $slots,
                $position['key'],
                $targetInfo,
                $serviceLevel / 100,
                $sellouts[$itemId] ?? [],
                $roundTo,
                $minQty,
                $known[$key] ?? null,
            );

            $savedRows = $saved->get($key);
            foreach ($forecast['slots'] as $slotKey => &$slotRow) {
                $record = $savedRows?->first(fn (ProductionPlanRecord $r) => (string) $r->slot_start === (string) $slotKey);
                $slotRow['saved_planned'] = $record ? (float) $record->planned_qty : null;
                $cell = $actual[$key][$targetDate][$slotKey] ?? null;
                $slotRow['actual'] = $reviewing ? (float) ($cell['qty'] ?? 0.0) : null;
                if ($reviewing) {
                    $slot = $slots->byKey((string) $slotKey);
                    [$wStart, $wEnd] = $slots->window($targetDate, $slot);
                    $slotRow['actual_sold_out'] = $this->soldOutAt($sellouts[$itemId] ?? [], $wStart, $wEnd) !== null;
                } else {
                    $slotRow['actual_sold_out'] = null;
                }
            }
            unset($slotRow);

            $forecast['day']['known'] = round((float) ($known[$key]['day'] ?? 0.0), 1);
            $forecast['day']['made'] = $reviewing ? round((float) ($made[$key] ?? 0.0), 1) : null;
            $forecast['day']['actual'] = $reviewing
                ? round(array_sum(array_map(fn (array $s) => (float) ($s['actual'] ?? 0.0), $forecast['slots'])), 1)
                : null;
            $forecast['day']['saved_planned'] = $savedRows
                ? round((float) $savedRows->sum('planned_qty'), 1)
                : null;

            $out['items'][] = [
                'key' => $key,
                'item_id' => $itemId,
                'variant_id' => $variantId,
                'name' => $variant ? $item->name . ' — ' . $variant->name : $item->name,
                'category' => $item->category?->name,
                'enabled' => (bool) ($cfg?->enabled ?? true),
                'service_level_pct' => $serviceLevel,
                'round_to' => $roundTo,
                'min_qty' => $minQty,
                'notes' => $cfg?->notes,
                'factors' => $forecast['factors'],
                'slots' => $forecast['slots'],
                'day' => $forecast['day'],
                'customers' => $this->customersFor($key, $perDay, $customerRows[$key] ?? [], $target, $sampleDates),
            ];
        }

        usort($out['items'], function (array $a, array $b): int {
            $byForecast = $b['day']['forecast'] <=> $a['day']['forecast'];

            return $byForecast !== 0 ? $byForecast : strcasecmp($a['name'], $b['name']);
        });

        return $out;
    }

    /**
     * Saved plans against what then sold, over the last few weeks.
     *
     * @param array{slots: list<array{label: string, from: int, to: int}>}|null $settings
     * @return array<string, mixed>
     */
    public function accuracy(int $weeks, ?array $settings = null): array
    {
        $slots = PlanSlots::fromSettings($settings ?? PlanSlots::load());
        $tz = config('app.timezone');
        $today = Carbon::now($tz)->startOfDay();
        $from = $today->copy()->subWeeks($weeks)->toDateString();

        $records = ProductionPlanRecord::query()
            ->where('plan_date', '>=', $from)
            ->where('plan_date', '<', $today->toDateString())
            ->orderBy('plan_date')
            ->orderBy('slot_start')
            ->get();

        $out = [
            'weeks' => $weeks,
            'from' => $from,
            'to' => $today->copy()->subDay()->toDateString(),
            'days' => 0,
            'totals' => null,
            'items' => [],
            'records' => [],
        ];
        if ($records->isEmpty()) {
            return $out;
        }

        $first = $records->min(fn (ProductionPlanRecord $r) => $r->plan_date->toDateString());
        $last = $records->max(fn (ProductionPlanRecord $r) => $r->plan_date->toDateString());
        $sales = $this->history->slotSales($first, $last, $slots)['items'];
        $sellouts = $this->history->selloutIntervals($first, $last);

        $keys = $records->map(fn (ProductionPlanRecord $r) => SalesHistory::key((int) $r->item_id, (int) $r->variant_id))->unique()->values()->all();
        [$items, $variants] = $this->catalogue($keys);

        $perItem = [];
        $totals = ['n' => 0, 'forecast' => 0.0, 'planned' => 0.0, 'actual' => 0.0, 'over' => 0.0, 'short' => 0.0, 'sold_out' => 0, 'enough' => 0, 'abs_error' => 0.0];
        $dates = [];

        foreach ($records as $record) {
            $key = SalesHistory::key((int) $record->item_id, (int) $record->variant_id);
            $date = $record->plan_date->toDateString();
            $slotKey = (string) $record->slot_start;
            $actualQty = (float) ($sales[$key][$date][$slotKey]['qty'] ?? 0.0);
            [$wStart, $wEnd] = $slots->window($date, ['from' => (int) $record->slot_start, 'to' => (int) $record->slot_end]);
            $soldOut = $this->soldOutAt($sellouts[(int) $record->item_id] ?? [], $wStart, $wEnd) !== null;

            if ($record->actual_qty === null || abs((float) $record->actual_qty - $actualQty) > 0.001 || (bool) $record->sold_out !== $soldOut) {
                $record->forceFill(['actual_qty' => $actualQty, 'sold_out' => $soldOut])->save();
            }

            $planned = (float) $record->planned_qty;
            $forecast = (float) $record->forecast_qty;
            $over = max(0.0, $planned - $actualQty);
            $short = max(0.0, $actualQty - $planned);
            $enough = !$soldOut && $actualQty <= $planned;

            [$itemId, $variantId] = SalesHistory::splitKey($key);
            $item = $items->get($itemId);
            $variant = $variantId > 0 ? $variants->get($variantId) : null;
            $name = $item ? ($variant ? $item->name . ' — ' . $variant->name : $item->name) : 'Deleted item';

            $row = $perItem[$key] ?? ['key' => $key, 'name' => $name, 'n' => 0, 'forecast' => 0.0, 'planned' => 0.0, 'actual' => 0.0, 'over' => 0.0, 'short' => 0.0, 'sold_out' => 0, 'enough' => 0, 'abs_error' => 0.0];
            foreach (['n' => 1, 'forecast' => $forecast, 'planned' => $planned, 'actual' => $actualQty, 'over' => $over, 'short' => $short, 'sold_out' => $soldOut ? 1 : 0, 'enough' => $enough ? 1 : 0, 'abs_error' => abs($forecast - $actualQty)] as $field => $delta) {
                $row[$field] += $delta;
                $totals[$field] += $delta;
            }
            $perItem[$key] = $row;
            $dates[$date] = true;

            $out['records'][] = [
                'date' => $date,
                'weekday' => $record->plan_date->format('D'),
                'slot_label' => $record->slot_label ?: sprintf('%02d–%02d', $record->slot_start, $record->slot_end),
                'slot_start' => (int) $record->slot_start,
                'name' => $name,
                'forecast' => round($forecast, 1),
                'planned' => round($planned, 1),
                'actual' => round($actualQty, 1),
                'sold_out' => $soldOut,
            ];
        }

        $finish = function (array $row): array {
            $row['bias_pct'] = $row['actual'] > 0 ? round(($row['forecast'] - $row['actual']) / $row['actual'] * 100, 1) : null;
            $row['enough_pct'] = $row['n'] > 0 ? round($row['enough'] / $row['n'] * 100) : null;
            $row['mean_abs_error'] = $row['n'] > 0 ? round($row['abs_error'] / $row['n'], 1) : null;
            foreach (['forecast', 'planned', 'actual', 'over', 'short'] as $f) {
                $row[$f] = round($row[$f], 1);
            }
            unset($row['abs_error']);

            return $row;
        };

        $out['days'] = count($dates);
        $out['totals'] = $finish($totals);
        $out['items'] = array_values(array_map($finish, $perItem));
        usort($out['items'], fn (array $a, array $b) => $b['actual'] <=> $a['actual']);
        $out['records'] = array_slice(array_reverse($out['records']), 0, 300);

        return $out;
    }

    // ── Pieces ─────────────────────────────────────────────────────────

    /**
     * @param array<string, float> $shopDayTotals
     * @param Collection<int, \App\Models\ProductionCalendarPeriod> $periods
     * @param array<string, string> $closures
     * @return array<string, array{weekday: int, position: string, kinds: list<string>, expectations: array<string, int>, rank: int}>
     */
    private function tradingDays(Carbon $from, Carbon $to, array $shopDayTotals, Collection $periods, array $closures): array
    {
        $days = [];
        for ($d = $from->copy(); $d->lte($to); $d->addDay()) {
            $ds = $d->toDateString();
            if (($shopDayTotals[$ds] ?? 0.0) <= 0) {
                continue; // nothing sold: closed, or before the till was in use
            }
            $info = $this->calendar->describe($ds, $periods, $closures);
            if ($info['closed']) {
                continue;
            }
            $days[$ds] = [
                'weekday' => $d->dayOfWeek,
                'position' => ProductionCalendar::monthPosition($d)['key'],
                'kinds' => $info['kinds'],
                'expectations' => $info['expectations'],
                'rank' => 0,
            ];
        }
        ksort($days);
        $i = 0;
        foreach ($days as &$info) {
            $info['rank'] = ++$i;
        }
        unset($info);

        return $days;
    }

    /**
     * The last N same-weekday trading days before the target, oldest first.
     *
     * @param array<string, array<string, mixed>> $days
     * @return list<string>
     */
    private function sampleDates(Carbon $target, Carbon $historyStart, array $days, int $sampleWeeks): array
    {
        $dates = [];
        for ($d = $target->copy()->subWeek(); $d->gte($historyStart) && count($dates) < $sampleWeeks; $d->subWeek()) {
            $ds = $d->toDateString();
            if (isset($days[$ds])) {
                $dates[] = $ds;
            }
        }

        return array_reverse($dates);
    }

    /**
     * @param array<string, array<string, array{qty: float, registered: float, orders: int}>> $perDay
     * @param array<string, array{weekday: int, position: string, kinds: list<string>, expectations: array<string, int>, rank: int}> $days
     * @param list<string> $sampleDates
     * @param array{kinds: list<string>, expectations: array<string, int>} $targetInfo
     * @param list<array{start: Carbon, end: Carbon|null, source: string}> $sellouts
     * @param array{day: float, slots: array<string, float>}|null $known
     * @return array{factors: array<string, mixed>, slots: array<string, array<string, mixed>>, day: array<string, mixed>}
     */
    private function forecastItem(
        array $perDay,
        array $days,
        array $sampleDates,
        PlanSlots $slots,
        string $targetPosition,
        array $targetInfo,
        float $serviceLevel,
        array $sellouts,
        int $roundTo,
        int $minQty,
        ?array $known,
    ): array {
        // Day totals for every trading day.
        $T = [];
        foreach ($days as $ds => $info) {
            $T[$ds] = array_sum(array_map(fn (array $c) => (float) $c['qty'], $perDay[$ds] ?? []));
        }

        // Days the item ran out on say nothing reliable about how a weekday,
        // a part of the month or a holiday sells; they are left out of the
        // learning below and only lifted, later, in the slot samples.
        $dayStart = $slots->dayStartHour();
        $censoredDays = [];
        if ($sellouts !== []) {
            foreach ($days as $ds => $info) {
                [$dStart, $dEnd] = $slots->window($ds, ['from' => $dayStart, 'to' => $dayStart]);
                if ($this->soldOutAt($sellouts, $dStart, $dEnd) !== null) {
                    $censoredDays[$ds] = true;
                }
            }
        }

        // What an ordinary day of each weekday sells.
        $byWeekday = [];
        $ordinary = [[], []];
        foreach ($days as $ds => $info) {
            if ($info['kinds'] !== [] || isset($censoredDays[$ds])) {
                continue;
            }
            $byWeekday[$info['weekday']][0][] = $T[$ds];
            $byWeekday[$info['weekday']][1][] = (float) $info['rank'];
            $ordinary[0][] = $T[$ds];
            $ordinary[1][] = (float) $info['rank'];
        }
        $ordinaryMean = WeightedStats::mean($ordinary[0], $ordinary[1]);
        $weekdayMean = fn (int $wd): float => isset($byWeekday[$wd])
            ? WeightedStats::mean($byWeekday[$wd][0], $byWeekday[$wd][1])
            : $ordinaryMean;

        // Month position: how far each part of the month departs from the
        // item's usual day, weekday effect removed first.
        $posRatios = [];
        foreach ($days as $ds => $info) {
            if ($info['kinds'] !== [] || isset($censoredDays[$ds])) {
                continue;
            }
            $wm = $weekdayMean($info['weekday']);
            if ($wm <= 0) {
                continue;
            }
            $posRatios[$info['position']][0][] = $T[$ds] / $wm;
            $posRatios[$info['position']][1][] = (float) $info['rank'];
        }
        $posIdx = [];
        $posMeta = [];
        foreach (array_keys(ProductionCalendar::monthPositions()) as $p) {
            $n = count($posRatios[$p][0] ?? []);
            $learned = $n > 0 ? WeightedStats::mean($posRatios[$p][0], $posRatios[$p][1]) : null;
            $posIdx[$p] = $n > 0 ? WeightedStats::shrink($learned, $n, 1.0, self::POSITION_SHRINK_DAYS) : 1.0;
            $posIdx[$p] = max(0.05, $posIdx[$p]);
            $posMeta[$p] = ['days_seen' => $n, 'learned' => $learned !== null ? round($learned, 3) : null, 'index' => round($posIdx[$p], 3)];
        }

        // Holiday kinds: the same, against what that weekday and month
        // position would have sold on an ordinary day.
        $kindRatios = [];
        $kindPriorSeen = [];
        foreach ($days as $ds => $info) {
            foreach ($info['kinds'] as $k) {
                if (isset($info['expectations'][$k])) {
                    $kindPriorSeen[$k] = 1 + $info['expectations'][$k] / 100;
                }
                if (isset($censoredDays[$ds])) {
                    continue;
                }
                $expected = $weekdayMean($info['weekday']) * $posIdx[$info['position']];
                if ($expected <= 0) {
                    continue;
                }
                $kindRatios[$k][0][] = $T[$ds] / $expected;
                $kindRatios[$k][1][] = (float) $info['rank'];
            }
        }
        $kindsInvolved = array_unique(array_merge($targetInfo['kinds'], array_keys($kindRatios), array_keys($kindPriorSeen)));
        $kindIdx = [];
        $kindMeta = [];
        foreach ($kindsInvolved as $k) {
            $prior = 1.0;
            if (in_array($k, $targetInfo['kinds'], true) && isset($targetInfo['expectations'][$k])) {
                $prior = 1 + $targetInfo['expectations'][$k] / 100;
            } elseif (isset($kindPriorSeen[$k])) {
                $prior = $kindPriorSeen[$k];
            }
            $prior = max(0.05, $prior);
            $n = count($kindRatios[$k][0] ?? []);
            $learned = $n > 0 ? WeightedStats::mean($kindRatios[$k][0], $kindRatios[$k][1]) : null;
            $kindIdx[$k] = max(0.05, $n > 0 ? WeightedStats::shrink($learned, $n, $prior, self::KIND_SHRINK_DAYS) : $prior);
            $kindMeta[$k] = [
                'days_seen' => $n,
                'learned' => $learned !== null ? round($learned, 3) : null,
                'expected' => round($prior, 3),
                'index' => round($kindIdx[$k], 3),
            ];
        }

        $dayFactor = function (string $pos, array $kinds) use ($posIdx, $kindIdx): float {
            $f = $posIdx[$pos] ?? 1.0;
            foreach ($kinds as $k) {
                $f *= $kindIdx[$k] ?? 1.0;
            }

            return max(0.05, $f);
        };
        $targetFactor = $dayFactor($targetPosition, $targetInfo['kinds']);

        // Now each slot.
        $weights = WeightedStats::linearWeights(count($sampleDates));
        $slotsOut = [];
        $dayForecast = 0.0;
        $dayPlanned = 0.0;

        foreach ($slots->all() as $slot) {
            $slotKey = $slot['key'];
            $entries = [];
            $values = [];
            $censored = [];

            foreach ($sampleDates as $i => $ds) {
                $qty = (float) ($perDay[$ds][$slotKey]['qty'] ?? 0.0);
                $f = $dayFactor($days[$ds]['position'], $days[$ds]['kinds']);
                [$wStart, $wEnd] = $slots->window($ds, $slot);
                $soldOutAt = $this->soldOutAt($sellouts, $wStart, $wEnd);
                $entries[] = [
                    'date' => $ds,
                    'qty' => $qty,
                    'sold_out' => $soldOutAt !== null,
                    'sold_out_at' => $soldOutAt?->format('H:i'),
                    'kinds' => $days[$ds]['kinds'],
                    'position' => $days[$ds]['position'],
                    'factor' => round($f, 3),
                    'lifted_to' => null,
                ];
                $values[] = $qty / $f;
                if ($soldOutAt !== null) {
                    $censored[] = $i;
                }
            }

            // A sold-out slot is a floor on demand, not a measure of it.
            if ($censored !== [] && count($censored) < count($values)) {
                $unc = [];
                $uw = [];
                foreach ($values as $i => $v) {
                    if (!in_array($i, $censored, true)) {
                        $unc[] = $v;
                        $uw[] = $weights[$i];
                    }
                }
                $median = WeightedStats::quantile($unc, $uw, 0.5);
                foreach ($censored as $i) {
                    if ($values[$i] < $median) {
                        $values[$i] = $median;
                        $entries[$i]['lifted_to'] = round($median * $entries[$i]['factor'], 1);
                    }
                }
            }

            $forecast = $values !== []
                ? round(WeightedStats::quantile($values, $weights, $serviceLevel) * $targetFactor, 1)
                : 0.0;
            $knownSlot = (float) ($known['slots'][$slotKey] ?? 0.0);
            $planned = max(WeightedStats::ceilTo($forecast, $roundTo), $knownSlot);

            $slotsOut[$slotKey] = [
                'label' => $slot['label'],
                'forecast' => $forecast,
                'planned' => $planned,
                'known' => round($knownSlot, 1),
                'sold_out_days' => count($censored),
                'sample' => $entries,
            ];
            $dayForecast += $forecast;
            $dayPlanned += $planned;
        }

        // Day floors: the item's own minimum, and what is already ordered
        // for the day without a collection time.
        $floor = max((float) $minQty, (float) ($known['day'] ?? 0.0));
        if ($slotsOut !== [] && $dayPlanned < $floor) {
            $biggest = null;
            foreach ($slotsOut as $k => $row) {
                if ($biggest === null || $row['planned'] > $slotsOut[$biggest]['planned']) {
                    $biggest = $k;
                }
            }
            $slotsOut[$biggest]['planned'] += $floor - $dayPlanned;
            $dayPlanned = $floor;
        }

        $lastSample = $sampleDates !== [] ? $sampleDates[count($sampleDates) - 1] : null;

        return [
            'factors' => [
                'day' => round($targetFactor, 3),
                'month_position' => $posMeta,
                'calendar' => $kindMeta,
                'weekday_mean' => round($weekdayMean(Carbon::parse($lastSample ?? 'today')->dayOfWeek), 1),
            ],
            'slots' => $slotsOut,
            'day' => [
                'forecast' => round($dayForecast, 1),
                'planned' => round($dayPlanned, 1),
                'sample_days' => count($sampleDates),
                'last_same_weekday' => $lastSample !== null ? ['date' => $lastSample, 'qty' => round($T[$lastSample] ?? 0.0, 1)] : null,
            ],
        ];
    }

    /**
     * Who buys this: how much of it goes to registered customers, and how
     * many of those are regulars. Aggregate only — no names leave here.
     *
     * @param array<string, array<string, array{qty: float, registered: float, orders: int}>> $perDay
     * @param array<int, array<string, float>> $rows customer id → date → qty
     * @param list<string> $sampleDates
     * @return array<string, mixed>
     */
    private function customersFor(string $key, array $perDay, array $rows, Carbon $target, array $sampleDates): array
    {
        $total = 0.0;
        $registered = 0.0;
        foreach ($perDay as $slotsOfDay) {
            foreach ($slotsOfDay as $cell) {
                $total += (float) $cell['qty'];
                $registered += (float) $cell['registered'];
            }
        }

        $windowStart = $target->copy()->subWeeks(self::REGULAR_WINDOW_WEEKS)->toDateString();
        $regulars = 0;
        $regularsQty = 0.0;
        $regularsOnSample = array_fill_keys($sampleDates, 0.0);

        foreach ($rows as $dates) {
            $weeks = [];
            $qty = 0.0;
            foreach ($dates as $ds => $q) {
                if ($ds < $windowStart) {
                    continue;
                }
                $weeks[Carbon::parse($ds)->format('o-W')] = true;
                $qty += (float) $q;
            }
            if (count($weeks) < self::REGULAR_MIN_WEEKS) {
                continue;
            }
            $regulars++;
            $regularsQty += $qty;
            foreach ($dates as $ds => $q) {
                if (array_key_exists($ds, $regularsOnSample)) {
                    $regularsOnSample[$ds] += (float) $q;
                }
            }
        }

        return [
            'registered_share_pct' => $total > 0 ? round($registered / $total * 100) : null,
            'buyers' => count($rows),
            'regulars' => $regulars,
            'regulars_weekly_qty' => round($regularsQty / self::REGULAR_WINDOW_WEEKS, 1),
            'regulars_same_weekday_avg' => $sampleDates !== []
                ? round(array_sum($regularsOnSample) / count($sampleDates), 1)
                : 0.0,
        ];
    }

    /**
     * The moment inside a window from which the item could not be sold, or
     * null if it was on sale throughout.
     *
     * @param list<array{start: Carbon, end: Carbon|null, source: string}> $intervals
     */
    private function soldOutAt(array $intervals, Carbon $windowStart, Carbon $windowEnd): ?Carbon
    {
        $earliest = null;
        foreach ($intervals as $interval) {
            if ($interval['start']->gte($windowEnd)) {
                continue;
            }
            if ($interval['end'] !== null && $interval['end']->lte($windowStart)) {
                continue;
            }
            $at = $interval['start']->lt($windowStart) ? $windowStart->copy() : $interval['start']->copy();
            if ($earliest === null || $at->lt($earliest)) {
                $earliest = $at;
            }
        }

        return $earliest;
    }

    /**
     * @param list<string> $keys
     * @return array{0: Collection<int, Item>, 1: Collection<int, Variant>}
     */
    private function catalogue(array $keys): array
    {
        $itemIds = [];
        $variantIds = [];
        foreach ($keys as $key) {
            [$i, $v] = SalesHistory::splitKey($key);
            $itemIds[$i] = true;
            if ($v > 0) {
                $variantIds[$v] = true;
            }
        }

        $items = $itemIds === []
            ? new Collection
            : Item::query()->whereIn('id', array_keys($itemIds))->with('category:id,name')->get()->keyBy('id');
        $variants = $variantIds === []
            ? new Collection
            : Variant::query()->whereIn('id', array_keys($variantIds))->get()->keyBy('id');

        return [$items, $variants];
    }
}
