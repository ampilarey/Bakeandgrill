<?php

declare(strict_types=1);

namespace App\Domains\Telegram\Support;

use App\Domains\Telegram\Support\TelegramText as T;
use App\Models\Order;
use App\Models\Payment;

/**
 * The pieces of an order card shared by the group feed and the driver's
 * deliveries: items, customer, address, how it was paid, cash to collect.
 */
final class TelegramOrderText
{
    private const PAID_STATUSES = ['paid', 'completed', 'confirmed'];

    public static function number(Order $order): string
    {
        return '#' . T::e((string) ($order->order_number ?? $order->id));
    }

    public static function type(Order $order): string
    {
        return match ((string) $order->type) {
            'delivery' => 'Delivery',
            'online_pickup' => 'Pickup',
            'dine_in' => 'Dine-in (ordered ahead)',
            'takeaway' => 'Takeaway',
            default => ucfirst(str_replace('_', ' ', (string) $order->type)),
        };
    }

    /** @return list<string> "2 × Chicken kottu (Large)", modifiers and notes under it. */
    public static function itemLines(Order $order, int $max = 25): array
    {
        $order->loadMissing('items.modifiers');
        $items = $order->items->whereNull('parent_order_item_id')->values();
        $lines = [];
        foreach ($items->take($max) as $item) {
            $qty = (float) $item->quantity;
            $name = (string) ($item->item_name ?: 'Item');
            if ((string) $item->variant_name !== '') {
                $name .= ' (' . $item->variant_name . ')';
            }
            $line = '• ' . (fmod($qty, 1.0) === 0.0 ? (int) $qty : $qty) . ' × ' . T::e($name);
            $mods = $item->modifiers->map(fn ($m) => (string) $m->modifier_name)->filter()->values();
            if ($mods->isNotEmpty()) {
                $line .= "\n   + " . T::e($mods->implode(', '));
            }
            if (trim((string) $item->notes) !== '') {
                $line .= "\n   <i>" . T::e(trim((string) $item->notes)) . '</i>';
            }
            $lines[] = $line;
        }
        if ($items->count() > $max) {
            $lines[] = '…and ' . ($items->count() - $max) . ' more';
        }

        return $lines;
    }

    public static function customerName(Order $order): string
    {
        $order->loadMissing('customer');

        return trim((string) ($order->delivery_contact_name ?: $order->customer?->name ?: $order->ticket_name ?: ''));
    }

    public static function customerPhone(Order $order): string
    {
        $order->loadMissing('customer');

        return trim((string) ($order->delivery_contact_phone ?: $order->customer?->phone ?: ''));
    }

    public static function address(Order $order): string
    {
        return collect([$order->delivery_address_line1, $order->delivery_address_line2, $order->delivery_island])
            ->map(fn ($p) => trim((string) $p))
            ->filter()
            ->implode(', ');
    }

    /** The customer's map pin, when they dropped one and it is a web link. */
    public static function mapLink(Order $order): ?string
    {
        $link = trim((string) $order->delivery_location_link);

        return preg_match('#^https?://#i', $link) ? $link : null;
    }

    /** Money taken so far on the order. */
    public static function paidSoFar(Order $order): float
    {
        return (float) Payment::query()
            ->where('order_id', $order->id)
            ->where('amount', '>', 0)
            ->whereIn('status', self::PAID_STATUSES)
            ->sum('amount');
    }

    /** What the driver collects at the door: nothing when it is paid. */
    public static function toCollect(Order $order): float
    {
        if ($order->payment_status === 'paid' || $order->paid_at !== null) {
            return 0.0;
        }

        return max(0.0, round((float) $order->total - self::paidSoFar($order), 2));
    }

    /** "BML online", "Cash, Card"; empty when nothing is paid. */
    public static function paidBy(Order $order, callable $label): string
    {
        return Payment::query()
            ->where('order_id', $order->id)
            ->where('amount', '>', 0)
            ->whereIn('status', self::PAID_STATUSES)
            ->pluck('method')
            ->unique()
            ->map(fn ($m) => (string) $label((string) $m))
            ->implode(', ');
    }

    /** When it is wanted: the pickup / arrival slot, else the delivery promise; another day says so. */
    public static function due(Order $order): ?string
    {
        $at = $order->pickup_slot_at ?? $order->delivery_eta_at;
        if ($at !== null) {
            $at = \Illuminate\Support\Carbon::parse($at);

            return $at->isToday() ? $at->format('g:i a') : $at->format('D j M, g:i a');
        }
        if ($order->fulfil_date !== null) {
            $day = \Illuminate\Support\Carbon::parse($order->fulfil_date);

            return $day->isToday() ? null : $day->format('D j M');
        }

        return null;
    }
}
