<?php

declare(strict_types=1);

namespace App\Domains\Promotions\Services;

use App\Domains\Orders\Support\DiscountSettings;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Promotion;
use App\Models\PromotionRedemption;
use App\Support\LaariConverter;

/**
 * The rules an automatic item or category promotion has to pass before it may
 * price a line (pricing audit, 2026-10-01, finding 1).
 *
 * Such a promotion is priced straight into the line rather than taken off the
 * order total, so it never went through PromotionEvaluator and none of its
 * limits applied. The same limits are checked here, counted the same way:
 * one use per order, pending orders (unpaid, not cancelled) count as used, and
 * a use becomes a PromotionRedemption when the order is paid
 * (RecordInLinePromotionRedemptionsListener).
 */
final class InLinePromotionGate
{
    /**
     * May this promotion price a line on this order?
     *
     * @param float $lineDiscountMvr what this line would save, in MVR
     */
    public function allows(Promotion $promotion, Order $order, float $lineDiscountMvr): bool
    {
        if (!$promotion->isValid()) {
            return false;
        }

        $customerId = $order->customer_id !== null ? (int) $order->customer_id : null;

        if ($promotion->registered_only && $customerId === null) {
            return false;
        }

        // A per-customer limit or a first-order offer needs to know who is
        // buying, exactly as a promo code does.
        if ($customerId === null && ($promotion->max_uses_per_customer || $promotion->first_order_only)) {
            return false;
        }

        $usedOnThisOrder = $this->alreadyOnOrder($promotion, $order);

        if ($promotion->max_uses && !$usedOnThisOrder) {
            $uses = (int) $promotion->redemptions_count + $this->pendingOrders($promotion, $order)->count();
            if ($uses >= (int) $promotion->max_uses) {
                return false;
            }
        }

        if ($customerId !== null && $promotion->max_uses_per_customer && !$usedOnThisOrder) {
            $confirmed = PromotionRedemption::query()
                ->where('promotion_id', $promotion->id)
                ->where('customer_id', $customerId)
                ->where(fn ($q) => $q->where('status', 'active')->orWhereNull('status'))
                ->count();
            $pending = $this->pendingOrders($promotion, $order)->where('customer_id', $customerId)->count();
            if ($confirmed + $pending >= (int) $promotion->max_uses_per_customer) {
                return false;
            }
        }

        if ($customerId !== null && $promotion->first_order_only && $this->hasEarlierOrder($customerId, $order)) {
            return false;
        }

        if ($promotion->budget_laar !== null) {
            $committed = (int) ($promotion->spent_laar ?? 0)
                + $this->pendingDiscountLaar($promotion, $order)
                + $this->discountOnOrderLaar($promotion, $order)
                + LaariConverter::toLaar($lineDiscountMvr);
            if ($committed > (int) $promotion->budget_laar) {
                return false;
            }
        }

        return true;
    }

    /**
     * The lowest unit price a promotion may take this item to, when the
     * margin floor is on: cost plus the floor percentage. Null when there is
     * no floor to apply. Same rule PromotionEvaluator applies to code
     * discounts on items.
     */
    public function floorUnitPrice(Item $item): ?float
    {
        if (!DiscountSettings::marginFloorEnabled()) {
            return null;
        }
        $cost = (float) ($item->cost ?? 0);
        if ($cost <= 0) {
            return null;
        }

        return ceil($cost * (1 + DiscountSettings::marginFloorPct() / 100) * 100) / 100;
    }

    /**
     * Other orders holding this promotion that are not paid yet and not
     * cancelled — the in-line equivalent of a draft OrderPromotion.
     *
     * @return \Illuminate\Database\Eloquent\Builder<Order>
     */
    private function pendingOrders(Promotion $promotion, Order $order)
    {
        return Order::query()
            ->whereKeyNot($order->id)
            ->whereNotIn('status', ['cancelled', 'refunded'])
            ->where(fn ($q) => $q->whereNull('payment_status')->orWhereNotIn('payment_status', ['paid']))
            ->whereHas('items', fn ($q) => $q->where('promotion_id', $promotion->id));
    }

    private function pendingDiscountLaar(Promotion $promotion, Order $order): int
    {
        $lines = OrderItem::query()
            ->where('promotion_id', $promotion->id)
            ->where('order_id', '!=', $order->id)
            ->whereHas('order', fn ($q) => $q
                ->whereNotIn('status', ['cancelled', 'refunded'])
                ->where(fn ($q2) => $q2->whereNull('payment_status')->orWhereNotIn('payment_status', ['paid'])))
            ->get(['unit_price', 'original_unit_price', 'quantity']);

        return self::discountLaar($lines);
    }

    private function discountOnOrderLaar(Promotion $promotion, Order $order): int
    {
        return self::discountLaar(OrderItem::query()
            ->where('order_id', $order->id)
            ->where('promotion_id', $promotion->id)
            ->get(['unit_price', 'original_unit_price', 'quantity']));
    }

    private function alreadyOnOrder(Promotion $promotion, Order $order): bool
    {
        return OrderItem::query()
            ->where('order_id', $order->id)
            ->where('promotion_id', $promotion->id)
            ->exists();
    }

    private function hasEarlierOrder(int $customerId, Order $order): bool
    {
        return Order::query()
            ->where('customer_id', $customerId)
            ->whereKeyNot($order->id)
            ->whereNotIn('status', ['cancelled', 'refunded'])
            ->where(fn ($q) => $q->whereIn('payment_status', ['paid', 'partial'])
                ->orWhereIn('status', ['completed', 'delivered', 'ready', 'preparing', 'confirmed', 'paid', 'in_progress']))
            ->exists();
    }

    /**
     * What a set of lines saved against their original price, in laari.
     *
     * @param iterable<OrderItem> $lines
     */
    public static function discountLaar(iterable $lines): int
    {
        $total = 0;
        foreach ($lines as $line) {
            if ($line->original_unit_price === null) {
                continue;
            }
            $perUnit = (float) $line->original_unit_price - (float) $line->unit_price;
            if ($perUnit <= 0) {
                continue;
            }
            $total += LaariConverter::toLaar($perUnit * (float) $line->quantity);
        }

        return $total;
    }
}
