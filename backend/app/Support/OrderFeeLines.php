<?php

declare(strict_types=1);

namespace App\Support;

use App\Domains\Orders\Services\PackagingOptionResolver;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\SiteSetting;

/**
 * The order-level fees as receipt and bill lines (owner, 2026-10-15: a
 * packaging fee of 10.00 was in the total but on no line, so Subtotal + GST
 * did not add up to it).
 *
 * Built from the stored order every time a receipt or bill is opened, so old
 * orders show the lines too. An item's own note ("Packaging fee · 5.00 × 2 =
 * 10.00") needs the fee stored on the order line, which orders from before
 * per-item packaging do not have; they show the total line alone.
 */
final class OrderFeeLines
{
    /**
     * Packaging, small-order and delivery fees, in the order the totals add them.
     *
     * @return list<array{label: string, amount: float}>
     */
    public static function for(?Order $order): array
    {
        if ($order === null) {
            return [];
        }

        $lines = [];
        $packaging = (int) ($order->packaging_fee_laar ?? 0);
        if ($packaging > 0) {
            $lines[] = ['label' => self::packagingLabel(), 'amount' => $packaging / 100];
        }
        $smallOrder = (int) ($order->small_order_fee_laar ?? 0);
        if ($smallOrder > 0) {
            $lines[] = ['label' => 'Small order fee', 'amount' => $smallOrder / 100];
        }
        $delivery = (float) ($order->delivery_fee ?? 0);
        if ($delivery > 0.0001) {
            $lines[] = ['label' => 'Delivery fee', 'amount' => round($delivery, 2)];
        }

        return $lines;
    }

    /**
     * "Packaging fee · 5.00 × 2 = 10.00" under an item, or null when the order
     * charged no packaging (dine-in) or the line has no fee of its own.
     */
    public static function itemPackagingNote(OrderItem $item, ?Order $order): ?string
    {
        if ($order === null || (int) ($order->packaging_fee_laar ?? 0) <= 0) {
            return null;
        }
        $fee = (float) ($item->packaging_fee ?? 0);
        $qty = max(0, (int) round((float) ($item->quantity ?? 0)));
        if ($fee <= 0 || $qty <= 0) {
            return null;
        }

        $name = trim((string) ($item->packaging_option_name ?? '')) ?: self::packagingLabel();
        if (($item->packaging_fee_mode ?? PackagingOptionResolver::MODE_PER_UNIT) === PackagingOptionResolver::MODE_PER_LINE) {
            return $name.' · '.number_format($fee, 2);
        }

        return $name.' · '.number_format($fee, 2).' × '.$qty.' = '.number_format($fee * $qty, 2);
    }

    private static function packagingLabel(): string
    {
        $label = trim((string) SiteSetting::get('packaging_fee_label', 'Packaging fee'));

        return $label !== '' ? $label : 'Packaging fee';
    }
}
