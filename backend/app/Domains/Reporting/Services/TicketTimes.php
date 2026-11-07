<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Services;

use App\Domains\Orders\Support\OrderTimeline;
use App\Models\Order;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * How long tickets take, stage by stage (owner, 2026-11-07: "Will the site record time for
 * each ticket and can admin view that?" → "Both"). Measured from each order's own stamps
 * through `OrderTimeline::stamps()`, so the timeline on an order and this report never
 * disagree:
 *
 *   to_kitchen  rung up → sent to the kitchen
 *   cooking     cooking started (or sent, when nobody tapped Start) → ready
 *   handover    ready → collected, served or delivered
 *   to_pay      rung up → paid, till tickets only (online orders pay first)
 *   total       rung up → collected, served or delivered
 *
 * A stage longer than `MAX_MINUTES` is a ticket closed long after the fact (forgotten on the
 * screen overnight): it is left out of the figures and counted in `left_out`, so one stale
 * ticket does not swamp a day's average. Cancelled tickets, gift cards and event orders are
 * not tickets here.
 */
final class TicketTimes
{
    public const STAGES = ['to_kitchen', 'cooking', 'handover', 'to_pay', 'total'];

    public const MAX_MINUTES = 720;

    private const TILL_TYPES = ['dine_in', 'takeaway'];

    /**
     * @param array{type?: ?string, user_id?: ?int} $f
     * @return array<string, mixed>
     */
    public function report(CarbonImmutable $from, CarbonImmutable $to, array $f = []): array
    {
        $from = $from->startOfDay();
        $to = $to->endOfDay();

        $rows = [];
        $leftOut = array_fill_keys(self::STAGES, 0);
        $staffIds = [];
        Order::query()
            ->whereBetween('created_at', [$from, $to])
            ->whereNotIn('status', ['cancelled', 'void'])
            ->whereNotIn('type', ['gift_card', 'catering'])
            ->when($f['type'] ?? null, fn ($q, $t) => $q->where('type', $t))
            ->when($f['user_id'] ?? null, fn ($q, $id) => $q->where('user_id', $id))
            ->select(['id', 'order_number', 'type', 'status', 'user_id', 'ticket_name', 'restaurant_table_id', 'created_at', 'held_at', 'fired_at',
                'kitchen_started_at', 'kitchen_done_at', 'ready_at', 'paid_at', 'completed_at', 'picked_up_at', 'delivered_at'])
            ->orderBy('id')
            ->chunk(1000, function ($orders) use (&$rows, &$leftOut, &$staffIds): void {
                foreach ($orders as $o) {
                    $s = OrderTimeline::stamps($o);
                    $m = [
                        'to_kitchen' => self::span($s['start'], $s['fired']),
                        'cooking' => self::span($s['cooking'] ?? $s['fired'], $s['ready']),
                        'handover' => self::span($s['ready'], $s['end']),
                        'to_pay' => in_array((string) $o->type, self::TILL_TYPES, true) && $o->user_id !== null ? self::span($s['start'], $s['paid']) : null,
                        'total' => self::span($s['start'], $s['end']),
                    ];
                    foreach ($m as $k => $v) {
                        if ($v !== null && $v > self::MAX_MINUTES) {
                            $leftOut[$k]++;
                            $m[$k] = null;
                        }
                    }
                    if ($o->user_id !== null) {
                        $staffIds[(int) $o->user_id] = true;
                    }
                    $rows[] = [
                        'id' => (int) $o->id,
                        'order_number' => (string) ($o->order_number ?? $o->id),
                        'type' => (string) $o->type,
                        'user_id' => $o->user_id !== null ? (int) $o->user_id : null,
                        'who' => trim((string) $o->ticket_name),
                        'table_id' => $o->restaurant_table_id,
                        'at' => $o->created_at,
                        'm' => $m,
                    ];
                }
            });

        $names = $staffIds === [] ? [] : User::query()->whereIn('id', array_keys($staffIds))->pluck('name', 'id')->all();
        $tables = \App\Models\RestaurantTable::query()->whereIn('id', array_values(array_filter(array_column($rows, 'table_id'))))->pluck('name', 'id')->all();

        return [
            'range' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'tickets' => count($rows),
            'stages' => self::stats($rows),
            'left_out' => $leftOut,
            'max_minutes' => self::MAX_MINUTES,
            'by_day' => self::grouped($rows, fn (array $r): string => $r['at']->toDateString(), true),
            'by_hour' => self::grouped($rows, fn (array $r): string => sprintf('%02d', (int) $r['at']->format('G')), true),
            'by_type' => self::grouped($rows, fn (array $r): string => $r['type']),
            'by_staff' => array_map(
                static fn (array $g): array => $g + ['name' => $g['key'] === 'online' ? 'Online (no cashier)' : ($names[(int) $g['key']] ?? 'Staff #' . $g['key'])],
                self::grouped($rows, fn (array $r): string => $r['user_id'] === null ? 'online' : (string) $r['user_id']),
            ),
            'slowest' => self::slowest($rows, $names, $tables),
            'type_choices' => array_values(array_unique(array_column($rows, 'type'))),
            'staff_choices' => collect($names)->map(fn ($n, $id) => ['id' => (int) $id, 'name' => (string) $n])->sortBy('name')->values()->all(),
        ];
    }

    private static function span(?\Carbon\CarbonInterface $a, ?\Carbon\CarbonInterface $b): ?float
    {
        return $a !== null && $b !== null ? OrderTimeline::minutes($a, $b) : null;
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return array<string, array{count: int, avg: ?float, median: ?float, p90: ?float, max: ?float}>
     */
    private static function stats(array $rows): array
    {
        $out = [];
        foreach (self::STAGES as $stage) {
            $v = array_values(array_filter(array_map(static fn (array $r) => $r['m'][$stage], $rows), static fn ($x) => $x !== null));
            sort($v);
            $n = count($v);
            $out[$stage] = [
                'count' => $n,
                'avg' => $n ? round(array_sum($v) / $n, 1) : null,
                'median' => $n ? self::pct($v, 0.5) : null,
                'p90' => $n ? self::pct($v, 0.9) : null,
                'max' => $n ? (float) $v[$n - 1] : null,
            ];
        }

        return $out;
    }

    /** @param list<float> $sorted */
    private static function pct(array $sorted, float $p): float
    {
        $i = ($p * (count($sorted) - 1));
        $lo = (int) floor($i);
        $hi = (int) ceil($i);

        return round($sorted[$lo] + ($sorted[$hi] - $sorted[$lo]) * ($i - $lo), 1);
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return list<array<string, mixed>>
     */
    private static function grouped(array $rows, callable $key, bool $sortByKey = false): array
    {
        $groups = [];
        foreach ($rows as $r) {
            $groups[$key($r)][] = $r;
        }
        $out = [];
        foreach ($groups as $k => $g) {
            $st = self::stats($g);
            $out[] = ['key' => (string) $k, 'tickets' => count($g)] + array_map(static fn (array $s) => $s['avg'], $st);
        }
        if ($sortByKey) {
            usort($out, static fn (array $a, array $b): int => strcmp($a['key'], $b['key']));
        } else {
            usort($out, static fn (array $a, array $b): int => $b['tickets'] <=> $a['tickets']);
        }

        return $out;
    }

    /**
     * The 15 longest tickets, by their whole time where they have one, else by cooking.
     *
     * @param list<array<string, mixed>> $rows
     * @param array<int, string> $names
     * @param array<int, string> $tables
     * @return list<array<string, mixed>>
     */
    private static function slowest(array $rows, array $names, array $tables): array
    {
        $scored = array_filter($rows, static fn (array $r): bool => $r['m']['total'] !== null || $r['m']['cooking'] !== null);
        usort($scored, static fn (array $a, array $b): int => ($b['m']['total'] ?? $b['m']['cooking']) <=> ($a['m']['total'] ?? $a['m']['cooking']));

        return array_map(static function (array $r) use ($names, $tables): array {
            $seat = $r['table_id'] !== null ? ($tables[(int) $r['table_id']] ?? null) : null;

            return [
                'id' => $r['id'],
                'order_number' => $r['order_number'],
                'type' => $r['type'],
                'at' => $r['at']->toIso8601String(),
                'who' => $seat !== null ? trim($seat . ($r['who'] !== '' && !str_contains($r['who'], $seat) ? ' · ' . $r['who'] : '')) : ($r['who'] !== '' ? $r['who'] : null),
                'staff' => $r['user_id'] !== null ? ($names[$r['user_id']] ?? null) : null,
            ] + $r['m'];
        }, array_slice($scored, 0, 15));
    }
}
