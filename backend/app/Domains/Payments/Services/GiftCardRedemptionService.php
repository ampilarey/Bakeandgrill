<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Domains\Orders\Support\EffectiveDiscount;
use App\Models\GiftCard;
use App\Models\GiftCardTransaction;
use App\Models\Order;

final class GiftCardRedemptionService
{
    /**
     * Deduct gift card balance for an order. Must run inside an outer DB transaction.
     */
    public function redeemForOrder(Order $order): void
    {
        if (empty($order->gift_card_id) || (int) ($order->gift_card_discount_laar ?? 0) <= 0) {
            return;
        }

        $alreadyRedeemed = GiftCardTransaction::where('order_id', $order->id)
            ->where('type', 'redeem')
            ->exists();
        if ($alreadyRedeemed) {
            return;
        }

        $giftCard = GiftCard::where('id', $order->gift_card_id)
            ->where('status', 'active')
            ->lockForUpdate()
            ->first();

        if (!$giftCard) {
            return;
        }

        // Re-check expiry at payment time (card may have expired after apply).
        if ($giftCard->expires_at && $giftCard->expires_at->isPast()) {
            $giftCard->update(['status' => 'expired']);

            return;
        }

        // Re-check idempotency after lock — concurrent payment + listener paths.
        $alreadyRedeemed = GiftCardTransaction::where('order_id', $order->id)
            ->where('type', 'redeem')
            ->exists();
        if ($alreadyRedeemed) {
            return;
        }

        $deductLaar = min(
            EffectiveDiscount::giftCardRedeemLaar($order),
            $giftCard->balanceLaar(),
        );
        if ($deductLaar <= 0) {
            return;
        }

        $newBalanceLaar = max(0, $giftCard->balanceLaar() - $deductLaar);
        $newBalanceMvr = round($newBalanceLaar / 100, 2);
        $deductMvr = round($deductLaar / 100, 2);

        $giftCard->update([
            'current_balance' => $newBalanceMvr,
            'status' => $newBalanceLaar <= 0 ? 'depleted' : 'active',
        ]);

        GiftCardTransaction::create([
            'gift_card_id' => $giftCard->id,
            'amount' => -$deductMvr,
            'type' => 'redeem',
            'balance_after' => $newBalanceMvr,
            'order_id' => $order->id,
        ]);
    }
}
