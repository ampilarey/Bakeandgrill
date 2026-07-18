<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Domains\Orders\Support\EffectiveDiscount;
use App\Models\GiftCard;
use App\Models\GiftCardTransaction;
use App\Models\Order;
use Illuminate\Support\Facades\DB;

final class GiftCardRedemptionService
{
    /**
     * Unpaid / unpaid-through-kitchen statuses that soft-reserve gift card balance.
     * Includes in_progress / ready / preparing so firing to KDS does not free the hold.
     */
    public const RESERVING_STATUSES = [
        'pending',
        'payment_pending',
        'partial',
        'held',
        'in_progress',
        'preparing',
        'ready',
    ];

    /**
     * Laari already claimed by other unpaid orders on this card.
     */
    public function reservedLaar(GiftCard $card, ?int $excludeOrderId = null): int
    {
        $query = Order::query()
            ->where('gift_card_id', $card->id)
            ->whereIn('status', self::RESERVING_STATUSES)
            ->where('gift_card_discount_laar', '>', 0);

        if ($excludeOrderId !== null) {
            $query->where('id', '!=', $excludeOrderId);
        }

        return (int) $query->sum('gift_card_discount_laar');
    }

    /**
     * Balance available to apply to an order (ledger balance minus other unpaid holds).
     */
    public function availableLaar(GiftCard $card, ?int $excludeOrderId = null): int
    {
        return max(0, $card->balanceLaar() - $this->reservedLaar($card, $excludeOrderId));
    }

    /**
     * Batch soft-reserve totals for a page of cards (laari keyed by gift_card_id).
     *
     * @param list<int> $cardIds
     * @return array<int, int>
     */
    public function reservedLaarByCardIds(array $cardIds): array
    {
        if ($cardIds === []) {
            return [];
        }

        return Order::query()
            ->selectRaw('gift_card_id, SUM(gift_card_discount_laar) as held_laar')
            ->whereIn('gift_card_id', $cardIds)
            ->whereIn('status', self::RESERVING_STATUSES)
            ->where('gift_card_discount_laar', '>', 0)
            ->groupBy('gift_card_id')
            ->pluck('held_laar', 'gift_card_id')
            ->map(fn ($v) => (int) $v)
            ->all();
    }

    /**
     * Clear gift-card soft holds on unpaid orders (e.g. before cancel).
     * Caller should recalculate order totals for each returned ID.
     *
     * @return list<int>
     */
    public function clearSoftReserves(GiftCard $card): array
    {
        $orders = Order::query()
            ->where('gift_card_id', $card->id)
            ->whereIn('status', self::RESERVING_STATUSES)
            ->get();

        $ids = [];
        foreach ($orders as $order) {
            $order->update([
                'gift_card_id' => null,
                'gift_card_discount_laar' => 0,
            ]);
            $ids[] = (int) $order->id;
        }

        return $ids;
    }

    /**
     * Deduct gift card balance for an order. Must run inside an outer DB transaction.
     *
     * @throws \RuntimeException when the order still claims a gift discount but balance is short
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
            throw new \RuntimeException('Gift card is no longer available for redemption.');
        }

        // Re-check expiry at payment time (card may have expired after apply).
        if ($giftCard->expires_at && $giftCard->expires_at->isPast()) {
            $giftCard->update(['status' => 'expired']);

            throw new \RuntimeException('Gift card expired before payment.');
        }

        // Re-check idempotency after lock — concurrent payment + listener paths.
        $alreadyRedeemed = GiftCardTransaction::where('order_id', $order->id)
            ->where('type', 'redeem')
            ->exists();
        if ($alreadyRedeemed) {
            return;
        }

        $neededLaar = EffectiveDiscount::giftCardRedeemLaar($order);
        if ($neededLaar <= 0) {
            return;
        }

        $deductLaar = min($neededLaar, $giftCard->balanceLaar());
        if ($deductLaar < $neededLaar) {
            throw new \RuntimeException(
                'Gift card balance is insufficient at payment time. Remove the gift card and try again.',
            );
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

    /**
     * Restore gift card balance after a refund (full or partial via ratio).
     * Idempotent per refund_id when provided.
     */
    public function restoreForOrder(Order $order, float $refundRatio = 1.0, ?int $refundId = null): void
    {
        $refundRatio = max(0.0, min(1.0, $refundRatio));
        if ($refundRatio <= 0) {
            return;
        }

        DB::transaction(function () use ($order, $refundRatio, $refundId): void {
            $redeem = GiftCardTransaction::query()
                ->where('order_id', $order->id)
                ->where('type', 'redeem')
                ->lockForUpdate()
                ->first();

            if (!$redeem) {
                return;
            }

            if ($refundId !== null) {
                $already = GiftCardTransaction::query()
                    ->where('order_id', $order->id)
                    ->where('type', 'refund')
                    ->where('refund_id', $refundId)
                    ->exists();
                if ($already) {
                    return;
                }
            }

            $redeemedMvr = abs((float) $redeem->amount);
            $alreadyRestoredMvr = (float) GiftCardTransaction::query()
                ->where('order_id', $order->id)
                ->where('type', 'refund')
                ->sum('amount');

            $remainingMvr = max(0.0, round($redeemedMvr - $alreadyRestoredMvr, 2));
            if ($remainingMvr <= 0) {
                return;
            }

            $restoreMvr = round(min($remainingMvr, $redeemedMvr * $refundRatio), 2);
            if ($restoreMvr <= 0) {
                return;
            }

            $giftCard = GiftCard::query()
                ->where('id', $redeem->gift_card_id)
                ->lockForUpdate()
                ->first();

            if (!$giftCard) {
                return;
            }

            // Do not revive cancelled/expired cards beyond a balance credit on cancelled.
            if ($giftCard->status === 'cancelled') {
                return;
            }

            $newBalanceMvr = round((float) $giftCard->current_balance + $restoreMvr, 2);
            $status = $giftCard->status;
            if ($status === 'depleted' && $newBalanceMvr > 0) {
                $status = 'active';
            }
            if ($giftCard->expires_at && $giftCard->expires_at->isPast()) {
                $status = 'expired';
            }

            $giftCard->update([
                'current_balance' => $newBalanceMvr,
                'status' => $status,
            ]);

            GiftCardTransaction::create([
                'gift_card_id' => $giftCard->id,
                'order_id' => $order->id,
                'refund_id' => $refundId,
                'amount' => $restoreMvr,
                'type' => 'refund',
                'balance_after' => $newBalanceMvr,
            ]);
        });
    }
}
