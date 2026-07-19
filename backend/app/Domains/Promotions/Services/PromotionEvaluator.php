<?php

declare(strict_types=1);

namespace App\Domains\Promotions\Services;

use App\Domains\Promotions\Repositories\PromotionRedemptionRepositoryInterface;
use App\Domains\Promotions\Repositories\PromotionRepositoryInterface;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderPromotion;
use App\Models\Promotion;
use App\Support\LaariConverter;

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
    public function __construct(
        private PromotionRepositoryInterface $promotionRepo,
        private PromotionRedemptionRepositoryInterface $redemptionRepo,
    ) {}

    /**
     * @return array{valid: bool, discount_laar: int, message: string, promotion: ?Promotion}
     */
    public function evaluate(string $code, Order $order, ?int $customerId = null): array
    {
        return $this->evaluateAgainstOrder($code, $order, $customerId, $order->id);
    }

    /**
     * Preview a promo against POS cart lines without persisting an order.
     *
     * @param  array<int, array{item_id: int, quantity?: numeric, unit_price: numeric, total_price?: numeric}>  $lines
     * @return array{valid: bool, discount_laar: int, message: string, promotion: ?Promotion}
     */
    public function evaluateForCart(string $code, array $lines, ?int $customerId = null): array
    {
        if ($lines === []) {
            return $this->reject('Cart is empty.');
        }

        return $this->evaluateAgainstOrder($code, $this->ephemeralOrderFromLines($lines), $customerId, null);
    }

    /**
     * @return array{valid: bool, discount_laar: int, message: string, promotion: ?Promotion}
     */
    private function evaluateAgainstOrder(
        string $code,
        Order $order,
        ?int $customerId,
        ?int $excludeOrderId,
    ): array {
        $normalizedCode = strtoupper(trim($code));

        $promotion = $this->promotionRepo->findByCodeWithRelations($normalizedCode, ['targets']);

        if (!$promotion) {
            return $this->reject('Promo code not found.');
        }

        if (!$promotion->isValid()) {
            return $this->reject('Promo code is not valid or has expired.');
        }

        // Campaign-wide max_uses: confirmed redemptions + pending draft reservations
        // on other non-cancelled orders (mirrors per-customer pending accounting).
        if ($promotion->max_uses && self::campaignUsageIncludingPending($promotion, $excludeOrderId) >= (int) $promotion->max_uses) {
            return $this->reject('Promo code is not valid or has expired.');
        }

        // Customer-restricted promo: only the designated customer may use it.
        if ($promotion->restricted_customer_id !== null) {
            if ($customerId === null || (int) $promotion->restricted_customer_id !== $customerId) {
                return $this->reject('This promo code is not valid for your account.');
            }
        }

        $order->loadMissing('items');
        $subtotalLaar = (int) ($order->subtotal_laar ?? round((float) $order->subtotal * 100));

        if ($subtotalLaar < $promotion->min_order_laar) {
            $minMvr = number_format($promotion->min_order_laar / 100, 2);

            return $this->reject("Minimum order of MVR {$minMvr} required.");
        }

        if ($customerId && $promotion->max_uses_per_customer) {
            // Confirmed redemptions (paid/completed orders)
            $confirmedUsage = $this->redemptionRepo->countByPromotionAndCustomer($promotion->id, $customerId);

            // Pending (draft) OrderPromotion rows on non-cancelled orders OTHER than the
            // current one. Without this check, a customer could open 5 carts, apply the
            // "once per customer" promo to all 5 before any payment is confirmed, and end
            // up with multiple redemptions.
            $pendingQuery = OrderPromotion::where('promotion_id', $promotion->id)
                ->where('status', 'draft')
                ->whereHas(
                    'order',
                    fn ($q) => $q
                        ->where('customer_id', $customerId)
                        ->whereNotIn('status', ['cancelled', 'refunded']),
                );

            if ($excludeOrderId !== null) {
                $pendingQuery->where('order_id', '!=', $excludeOrderId);
            }

            if ($confirmedUsage + $pendingQuery->count() >= $promotion->max_uses_per_customer) {
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

    /**
     * @param  array<int, array{item_id: int, quantity?: numeric, unit_price: numeric, total_price?: numeric}>  $lines
     */
    private function ephemeralOrderFromLines(array $lines): Order
    {
        $itemIds = collect($lines)->pluck('item_id')->map(fn ($id) => (int) $id)->unique()->values()->all();
        $catalog = Item::query()->whereIn('id', $itemIds)->get()->keyBy('id');

        $orderItems = collect();
        $subtotalLaar = 0;

        foreach ($lines as $line) {
            $itemId = (int) ($line['item_id'] ?? 0);
            if ($itemId <= 0) {
                continue;
            }

            $qty = max(1, (int) ($line['quantity'] ?? 1));
            $unitPrice = round((float) ($line['unit_price'] ?? 0), 2);
            $totalPrice = array_key_exists('total_price', $line)
                ? round((float) $line['total_price'], 2)
                : round($unitPrice * $qty, 2);
            $subtotalLaar += LaariConverter::toLaar($totalPrice);

            $orderItem = new OrderItem([
                'item_id' => $itemId,
                'quantity' => $qty,
                'unit_price' => $unitPrice,
                'total_price' => $totalPrice,
            ]);
            $orderItem->setRelation('item', $catalog->get($itemId));
            $orderItems->push($orderItem);
        }

        $order = new Order([
            'subtotal' => $subtotalLaar / 100,
            'subtotal_laar' => $subtotalLaar,
        ]);
        $order->setRelation('items', $orderItems);

        return $order;
    }

    private function calculateDiscount(Promotion $promo, Order $order, int $subtotalLaar): int
    {
        $applicableAmount = $this->applicableSubtotal($promo, $order);

        return match ($promo->type) {
            'percentage' => (int) floor($applicableAmount * $promo->discount_value / 100),
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
                return (int) ($order->subtotal_laar ?? LaariConverter::toLaar($order->subtotal));
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

            $total += LaariConverter::toLaar($orderItem->total_price);
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

        return LaariConverter::toLaar($cheapestItem->unit_price);
    }

    /**
     * Confirmed redemptions_count + draft OrderPromotion rows on other
     * non-cancelled/non-refunded orders (excluding $excludeOrderId).
     */
    public static function campaignUsageIncludingPending(Promotion $promotion, ?int $excludeOrderId = null): int
    {
        $confirmed = (int) $promotion->redemptions_count;

        $pendingQuery = OrderPromotion::where('promotion_id', $promotion->id)
            ->where('status', 'draft')
            ->whereHas(
                'order',
                fn ($q) => $q->whereNotIn('status', ['cancelled', 'refunded']),
            );

        if ($excludeOrderId !== null) {
            $pendingQuery->where('order_id', '!=', $excludeOrderId);
        }

        return $confirmed + (int) $pendingQuery->count();
    }

    private function reject(string $message): array
    {
        return ['valid' => false, 'discount_laar' => 0, 'message' => $message, 'promotion' => null];
    }
}
