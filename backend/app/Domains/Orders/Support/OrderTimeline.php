<?php

declare(strict_types=1);

namespace App\Domains\Orders\Support;

use App\Models\Order;
use Carbon\CarbonInterface;

/**
 * Every recorded step of one ticket, in the order they happened, with the minutes between
 * them (owner, 2026-11-07: "Will the site record time for each ticket and can admin view
 * that?" → "Both"). Read from the order's own stamps, so old orders show what they have.
 * The Ticket times report (`TicketTimes`) measures its stages from the same stamps
 * through `stamps()`.
 */
final class OrderTimeline
{
    /** Types placed by the customer rather than rung up at the till. */
    private const ONLINE = ['online_pickup', 'delivery'];

    /**
     * The stamps that mark each stage, by name. "ready" is the kitchen's first word that the
     * food is done (Done on the kitchen screen or Mark ready, whichever came first); "end" is
     * when the ticket left (completed, delivered or picked up).
     *
     * @return array{start: ?CarbonInterface, fired: ?CarbonInterface, cooking: ?CarbonInterface, ready: ?CarbonInterface, paid: ?CarbonInterface, end: ?CarbonInterface}
     */
    public static function stamps(Order $o): array
    {
        $ready = self::earliest($o->kitchen_done_at, $o->ready_at);
        $end = self::earliest($o->completed_at, $o->delivered_at, $o->type === 'delivery' ? null : $o->picked_up_at);

        return [
            'start' => $o->created_at,
            'fired' => $o->fired_at,
            'cooking' => $o->kitchen_started_at,
            'ready' => $ready,
            'paid' => $o->paid_at,
            'end' => $end,
        ];
    }

    /**
     * @return array{steps: list<array{key: string, label: string, at: string, minutes_from_previous: ?float, minutes_from_start: float}>, total_minutes: ?float, open: bool}
     */
    public static function for(Order $o): array
    {
        $online = in_array((string) $o->type, self::ONLINE, true) || $o->user_id === null;
        $candidates = [
            ['start', $online ? 'Placed online' : 'Rung up', $o->created_at],
            ['held', 'Saved', $o->held_at],
            ['fired', 'Sent to kitchen', $o->fired_at],
            ['cooking', 'Cooking started', $o->kitchen_started_at],
            ['ready', 'Ready', self::stamps($o)['ready']],
            ['paid', 'Paid', $o->paid_at],
            ['driver', 'Driver assigned', $o->driver_assigned_at],
            ['picked_up', $o->type === 'delivery' ? 'Out for delivery' : 'Picked up', $o->picked_up_at],
            ['delivered', 'Delivered', $o->delivered_at],
            ['completed', in_array((string) $o->type, ['takeaway', 'online_pickup'], true) ? 'Collected' : 'Completed', $o->completed_at],
            ['cancelled', 'Cancelled', $o->cancelled_at],
        ];

        $steps = array_values(array_filter($candidates, static fn (array $c): bool => $c[2] instanceof CarbonInterface));
        // Online orders are paid before the kitchen sees them; the till's are paid at the end.
        // Sort by when each happened, keeping the list's order for steps stamped together.
        $i = 0;
        $steps = array_map(static function (array $c) use (&$i): array {
            return [$c[0], $c[1], $c[2], $i++];
        }, $steps);
        usort($steps, static fn (array $a, array $b): int => [$a[2]->getTimestamp(), $a[3]] <=> [$b[2]->getTimestamp(), $b[3]]);

        $start = $o->created_at;
        $prev = null;
        $out = [];
        foreach ($steps as [$key, $label, $at]) {
            $out[] = [
                'key' => $key,
                'label' => $label,
                'at' => $at->toIso8601String(),
                'minutes_from_previous' => $prev === null ? null : self::minutes($prev, $at),
                'minutes_from_start' => $start === null ? 0.0 : self::minutes($start, $at),
            ];
            $prev = $at;
        }

        $end = self::stamps($o)['end'] ?? $o->cancelled_at;
        $finished = $end !== null || in_array((string) $o->status, ['completed', 'cancelled', 'refunded', 'void'], true);

        return [
            'steps' => $out,
            'total_minutes' => $end !== null && $start !== null ? self::minutes($start, $end) : null,
            'open' => !$finished,
        ];
    }

    public static function minutes(CarbonInterface $from, CarbonInterface $to): float
    {
        return round(max(0, $to->getTimestamp() - $from->getTimestamp()) / 60, 1);
    }

    private static function earliest(?CarbonInterface ...$times): ?CarbonInterface
    {
        $times = array_values(array_filter($times));
        if ($times === []) {
            return null;
        }
        usort($times, static fn (CarbonInterface $a, CarbonInterface $b): int => $a->getTimestamp() <=> $b->getTimestamp());

        return $times[0];
    }
}
