<?php

declare(strict_types=1);

namespace App\Domains\Promotions\Services;

use App\Models\Order;
use App\Models\Promotion;
use App\Models\PromotionRedemption;

/**
 * Evaluates whether a promo code is valid for an order and calculates the discount.
 *
 * Rules:
 *   1. Code is normalized (trim + uppercase) before lookup
 *   2. Must be active, within date range, and not exhausted
 *   3. Order subtotal must meet min_order_laar threshold
 *   4. Customer-specific usage limit enforced if customer is known
 *   5. Exclusions: items/categories in exclusion targets are excluded
 *   6. Includes: if includes defined, only apply to included items/categories
 */
class PromotionEvaluator
{
    /**
     * @return array{valid: bool, discount_laar: int, message: string, promotion: ?Promotion}
     */
    public function evaluate(string $code, Order $order, ?int $customerId = null): array
    {
        $normalizedCode = strtoupper(trim($code));

        $promotion = Promotion::where('code', $normalizedCode)
            ->with(['targets'])
            ->first();

        if (!$promotion) {
            return $this->reject('Promo code not found.');
        }

        if (!$promotion->isValid()) {
            return $this->reject('Promo code is not valid or has expired.');
        }

        $order->loadMissing('items');
        $subtotalLaar = (int) round($order->subtotal * 100);

        if ($subtotalLaar < $promotion->min_order_laar) {
            $minMvr = number_format($promotion->min_order_laar / 100, 2);

            return $this->reject("Minimum order of MVR {$minMvr} required.");
        }

        if ($customerId && $promotion->max_uses_per_customer) {
            $customerUsage = PromotionRedemption::where('promotion_id', $promotion->id)
                ->where('customer_id', $customerId)
                ->count();

            if ($customerUsage >= $promotion->max_uses_per_customer) {
                return $this->reject('You have already used this promo code the maximum number of times.');
            }
        }

        $discountLaar = $this->calculateDiscount($promotion, $order, $subtotalLaar);

        if ($discountLaar <= 0) {
            return $this->reject('Promo code does not apply to any items in your order.');
        }

        return [
            'valid' => true,
            'discount_laar' => $discountLaar,
            'message' => 'Promo code applied successfully.',
            'promotion' => $promotion,
        ];
    }

    private function calculateDiscount(Promotion $promo, Order $order, int $subtotalLaar): int
    {
        $applicableAmount = $this->applicableSubtotal($promo, $order);

        return match ($promo->type) {
            'percentage' => (int) floor($applicableAmount * $promo->discount_value / 10000),
            'fixed' => min($promo->discount_value, $applicableAmount),
            'free_item' => $this->freeItemDiscount($promo, $order),
            default => 0,
        };
    }

    /**
     * Calculate the subtotal amount that the promotion can be applied to,
     * taking into account inclusions and exclusions.
     */
    private function applicableSubtotal(Promotion $promo, Order $order): int
    {
        if ($promo->scope === 'order') {
            if ($promo->targets->isEmpty()) {
                return (int) round($order->subtotal * 100);
            }
        }

        $inclusions = $promo->targets->where('is_exclusion', false);
        $exclusions = $promo->targets->where('is_exclusion', true);

        $excludedItemIds = $exclusions->where('target_type', 'item')->pluck('target_id')->toArray();
        $excludedCategoryIds = $exclusions->where('target_type', 'category')->pluck('target_id')->toArray();

        $includedItemIds = $inclusions->where('target_type', 'item')->pluck('target_id')->toArray();
        $includedCategoryIds = $inclusions->where('target_type', 'category')->pluck('target_id')->toArray();

        $total = 0;
        foreach ($order->items as $orderItem) {
            $itemId = $orderItem->item_id;
            $categoryId = $orderItem->item?->category_id ?? null;

            if (in_array($itemId, $excludedItemIds) || in_array($categoryId, $excludedCategoryIds)) {
                continue;
            }

            if (!empty($includedItemIds) || !empty($includedCategoryIds)) {
                if (!in_array($itemId, $includedItemIds) && !in_array($categoryId, $includedCategoryIds)) {
                    continue;
                }
            }

            $total += (int) round((float) $orderItem->total_price * 100);
        }

        return $total;
    }

    private function freeItemDiscount(Promotion $promo, Order $order): int
    {
        // Free item = cheapest qualifying item's price
        $targets = $promo->targets->where('is_exclusion', false)->where('target_type', 'item');
        if ($targets->isEmpty()) {
            return 0;
        }

        $targetItemIds = $targets->pluck('target_id')->toArray();
        $cheapestItem = $order->items
            ->filter(fn ($i) => in_array($i->item_id, $targetItemIds))
            ->sortBy('unit_price')
            ->first();

        if (!$cheapestItem) {
            return 0;
        }

        return (int) round((float) $cheapestItem->unit_price * 100);
    }

    private function reject(string $message): array
    {
        return ['valid' => false, 'discount_laar' => 0, 'message' => $message, 'promotion' => null];
    }
}
