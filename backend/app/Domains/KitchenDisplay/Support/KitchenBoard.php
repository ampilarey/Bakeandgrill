<?php

declare(strict_types=1);

namespace App\Domains\KitchenDisplay\Support;

use App\Domains\Kitchen\Support\KitchenHandoverSettings;
use App\Models\MenuGroup;
use App\Models\Order;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

/**
 * What the kitchen screen, the wall board and the stream agree a kitchen
 * ticket is, and where it sits.
 *
 * Kitchen audit, 2026-09-26. The order status carries payment as well as
 * cooking: a ticket paid at the till mid-cook reads `paid`, and the kitchen
 * screen filed every paid order under "New", with the start button and the
 * new-order chime. The lane now comes from the kitchen's own timestamps
 * (started, done, ready), and a ticket that was ready and then paid (the
 * table paying at the end) has left the kitchen.
 */
final class KitchenBoard
{
    /**
     * Statuses that can carry kitchen work. 'paid' and 'partial' are also
     * online orders received but not started, and split tenders still
     * cooking; 'preparing' is an alias some flows use.
     */
    public const STATUSES = ['pending', 'in_progress', 'paid', 'partial', 'preparing', 'ready'];

    /** How long a cancelled ticket stays up, flagged, so the cook sees it go. */
    public const CANCELLED_SHOW_MINUTES = 3;

    public static function leadMinutes(): int
    {
        return KitchenHandoverSettings::scheduledPickupLeadMinutes();
    }

    /**
     * The kitchen's orders now.
     *
     * @param Builder<Order> $query
     * @return Builder<Order>
     */
    public static function visible(Builder $query, bool $withRecentlyCancelled = false): Builder
    {
        $query->where(function (Builder $q) use ($withRecentlyCancelled): void {
            $q->where(fn (Builder $open) => self::open($open));
            if ($withRecentlyCancelled) {
                $q->orWhere(fn (Builder $gone) => self::recentlyCancelled($gone));
            }
        });

        return self::holds($query);
    }

    /**
     * Scheduled pickups for later today, held until their lead time.
     */
    public static function laterTodayCount(): int
    {
        $lead = self::leadMinutes();

        return Order::query()
            ->whereIn('status', self::STATUSES)
            ->where('type', 'online_pickup')
            ->whereNull('fired_at')
            ->whereNotNull('pickup_slot_at')
            ->where('pickup_slot_at', '>', now()->addMinutes($lead))
            ->where('pickup_slot_at', '<=', now()->endOfDay())
            ->where(fn (Builder $q) => $q->whereNull('fulfil_date')->orWhereDate('fulfil_date', '<=', today()))
            ->count();
    }

    /** new | cooking | ready | cancelled */
    public static function lane(Order $order): string
    {
        $status = (string) $order->status;

        return match (true) {
            $status === 'cancelled' => 'cancelled',
            $status === 'ready' => 'ready',
            in_array($status, ['in_progress', 'preparing'], true) => 'cooking',
            $order->kitchen_started_at !== null || $order->kitchen_done_at !== null => 'cooking',
            default => 'new',
        };
    }

    /**
     * When the kitchen's clock starts. Not when the order was placed: a
     * collect-tomorrow order fired this morning was a day old, and an online
     * order counted the minutes the customer spent paying. A scheduled
     * pickup starts its lead time before the slot.
     */
    public static function clockAt(Order $order): Carbon
    {
        if ($order->fired_at !== null) {
            return Carbon::parse($order->fired_at);
        }

        $start = Carbon::parse(
            ($order->isCustomerPlaced() ? $order->paid_at : null) ?? $order->created_at ?? now(),
        );

        if ($order->pickup_slot_at !== null) {
            $due = Carbon::parse($order->pickup_slot_at)->subMinutes(self::leadMinutes());
            if ($due->gt($start)) {
                return $due;
            }
        }

        return $start;
    }

    /** @param Builder<Order> $q */
    private static function open(Builder $q): void
    {
        $q->whereIn('status', self::STATUSES)
            // Ready and then paid: served, and done for the kitchen. Before
            // this the table paying at the end brought its ticket back as new.
            ->where(fn (Builder $w) => $w->whereNotIn('status', ['paid', 'partial'])->orWhereNull('ready_at'));
    }

    /**
     * Cancelled in the last few minutes after the kitchen was told about it,
     * so the ticket turns red instead of silently vanishing mid-cook.
     *
     * @param Builder<Order> $q
     */
    private static function recentlyCancelled(Builder $q): void
    {
        $q->where('status', 'cancelled')
            ->where('cancelled_at', '>=', now()->subMinutes(self::CANCELLED_SHOW_MINUTES))
            ->where(fn (Builder $w) => $w->whereNotNull('kitchen_started_at')
                ->orWhereHas('items', fn (Builder $line) => $line->whereNotNull('kitchen_sent_at')));
    }

    /**
     * Orders that are real but not the kitchen's yet, or never.
     *
     * @param Builder<Order> $query
     * @return Builder<Order>
     */
    private static function holds(Builder $query): Builder
    {
        $query->where('type', '!=', 'gift_card')
            // Catering stays off until an appointed staff member fires it.
            ->where(fn (Builder $q) => $q->where('type', '!=', 'catering')->orWhereNotNull('fired_at'))
            // Collect-another-day: off until fired.
            ->where(fn (Builder $q) => $q->whereNull('fulfil_date')->orWhereNotNull('fired_at'))
            // Prepaid dine-in from the app: off until staff fire it ahead of arrival.
            ->where(fn (Builder $q) => $q->where('type', '!=', 'dine_in')
                ->orWhereNotNull('fired_at')
                ->orWhereNotNull('user_id'))
            // Kitchen audit, 2026-09-26: a pickup booked for later today
            // waits until its lead time, instead of arriving hours early and
            // turning late while nobody should be cooking it.
            ->where(fn (Builder $q) => $q->where('type', '!=', 'online_pickup')
                ->orWhereNull('pickup_slot_at')
                ->orWhereNotNull('fired_at')
                ->orWhereNotNull('kitchen_started_at')
                ->orWhere('pickup_slot_at', '<=', now()->addMinutes(self::leadMinutes())));

        /*
         * Nothing to make, nothing to show (owner, 2026-09-09): an order made
         * only of counter goods is hidden. An order with no lines, or a line
         * whose catalogue row has gone, still shows.
         */
        $counterGroups = MenuGroup::counterGroupIds();
        if ($counterGroups !== []) {
            $query->where(function (Builder $q) use ($counterGroups): void {
                $q->whereDoesntHave('items')
                    ->orWhereHas('items', function (Builder $line) use ($counterGroups): void {
                        $line->whereDoesntHave('item')
                            ->orWhereHas('item', fn (Builder $item) => $item->whereNull('menu_group_id')
                                ->orWhereNotIn('menu_group_id', $counterGroups));
                    });
            });
        }

        return $query;
    }
}
