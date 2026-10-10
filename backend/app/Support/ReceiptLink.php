<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Order;
use App\Models\Receipt;
use Illuminate\Support\Str;

/**
 * The web receipt link for an order, making its receipt row on first use.
 * The completion receipt text and the "delivered" text (which carries the
 * receipt since 2026-10-10) share it.
 */
final class ReceiptLink
{
    public static function forOrder(Order $order, ?string $phone = null): string
    {
        $receipt = Receipt::firstOrNew(['order_id' => $order->id]);
        if (!$receipt->exists) {
            $receipt->token = Str::random(48);
        }
        $receipt->customer_id = $order->customer_id;
        if ($phone !== null && $phone !== '') {
            $receipt->fill(['channel' => 'sms', 'recipient' => $phone]);
        }
        $receipt->save();

        return rtrim((string) config('app.url'), '/') . '/receipts/' . $receipt->token;
    }
}
