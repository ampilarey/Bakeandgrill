<?php

declare(strict_types=1);

namespace App\Domains\Promotions\Services;

use App\Domains\Orders\Support\DiscountSettings;
use App\Domains\Promotions\Repositories\PromotionRedemptionRepositoryInterface;
use App\Domains\Promotions\Repositories\PromotionRepositoryInterface;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderPromotion;
use App\Models\Promotion;
use App\Models\SiteSetting;
use App\Support\LaariConverter;
use Illuminate\Support\Facades\Log;

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
     * Apply all eligible auto-apply (no-code, all-customer) promotions.
     * Persists OrderPromotion drafts and updates order.promo_discount_laar.
     * Caller should recalculateAndPersist afterwards.
     *
     * When $itemLevelAlreadyInLinePrices is true (EffectivePriceService baked
     * item/category auto-promos into unit prices), those promos are skipped so
     * we never double-discount. Order-level auto-promos still apply.
     *
     * @return list<array{promotion: Promotion, discount_laar: int}>
     */
    public function applyAutomatic(
        Order $order,
        ?int $customerId = null,
        bool $itemLevelAlreadyInLinePrices = false,
    ): array {
        $order->loadMissing('items.item');

        // Drop stale auto-promo drafts so a re-run after cart changes cannot
        // leave an ineligible draft that still sums into promo_discount_laar.
        // Coded-promo drafts and consumed/released rows are left alone.
        OrderPromotion::query()
            ->where('order_id', $order->id)
            ->where('status', 'draft')
            ->whereHas('promotion', fn ($q) => $q->where('auto_apply', true))
            ->delete();

        $candidates = Promotion::query()
            ->autoApply()
            ->active()
            ->with('targets')
            ->get()
            ->filter(fn (Promotion $p) => $p->isValid());

        $eligible = [];
        foreach ($candidates as $promotion) {
            if ($itemLevelAlreadyInLinePrices && $this->isItemLevelPromo($promotion)) {
                continue;
            }

            $check = $this->eligibilityForPromotion($promotion, $order, $customerId, $order->id);
            if (!$check['valid']) {
                continue;
            }

            $eligible[] = [
                'promotion' => $promotion,
                'discount_laar' => (int) $check['discount_laar'],
            ];
        }

        if ($eligible === []) {
            $totalPromoDiscount = (int) OrderPromotion::where('order_id', $order->id)
                ->where('status', 'draft')
                ->sum('discount_laar');
            $order->update(['promo_discount_laar' => $totalPromoDiscount]);

            return [];
        }

        $policy = (string) SiteSetting::get('discount_stacking_policy', 'best_wins');
        $selected = $this->selectByStackingPolicy($eligible, $policy);

        $applied = [];
        foreach ($selected as $row) {
            /** @var Promotion $promotion */
            $promotion = $row['promotion'];
            $discountLaar = (int) $row['discount_laar'];
            $idempotencyKey = 'order-promo:' . $order->id . ':' . $promotion->id;

            OrderPromotion::firstOrCreate(
                ['idempotency_key' => $idempotencyKey],
                [
                    'order_id' => $order->id,
                    'promotion_id' => $promotion->id,
                    'discount_laar' => $discountLaar,
                    'status' => 'draft',
                ],
            );

            $applied[] = $row;
        }

        $totalPromoDiscount = (int) OrderPromotion::where('order_id', $order->id)
            ->where('status', 'draft')
            ->sum('discount_laar');

        $order->update(['promo_discount_laar' => $totalPromoDiscount]);

        return $applied;
    }

    /**
     * Item/category-targeted promo (has inclusion targets) vs order-level.
     */
    public function isItemLevelPromo(Promotion $promo): bool
    {
        $promo->loadMissing('targets');
        $inclusions = $promo->targets->where('is_exclusion', false);

        return $inclusions->isNotEmpty();
    }

    /**
     * @param list<array{promotion: Promotion, discount_laar: int}> $eligible
     * @return list<array{promotion: Promotion, discount_laar: int}>
     */
    private function selectByStackingPolicy(array $eligible, string $policy): array
    {
        if ($eligible === []) {
            return [];
        }

        if ($policy === 'stack') {
            return $eligible;
        }

        // best_wins: largest merchandise discount; delivery waivers stay orthogonal.
        $waivers = array_values(array_filter(
            $eligible,
            fn (array $row) => $this->isDeliveryWaiver($row['promotion']),
        ));
        $merchandise = array_values(array_filter(
            $eligible,
            fn (array $row) => !$this->isDeliveryWaiver($row['promotion']),
        ));

        $selected = [];
        if ($merchandise !== []) {
            usort($merchandise, fn (array $a, array $b) => $b['discount_laar'] <=> $a['discount_laar']);
            $selected[] = $merchandise[0];
        }

        foreach ($waivers as $waiver) {
            $selected[] = $waiver;
        }

        return $selected;
    }

    /**
     * Shared eligibility + discount calc without requiring a code lookup.
     *
     * @return array{valid: bool, discount_laar: int, message: string, promotion: ?Promotion}
     */
    private function eligibilityForPromotion(
        Promotion $promotion,
        Order $order,
        ?int $customerId,
        ?int $excludeOrderId,
    ): array {
        if (!$promotion->isValid()) {
            return $this->reject('Promo code is not valid or has expired.');
        }

        if ($promotion->max_uses && self::campaignUsageIncludingPending($promotion, $excludeOrderId) >= (int) $promotion->max_uses) {
            return $this->reject('Promo code is not valid or has expired.');
        }

        if ($promotion->restricted_customer_id !== null) {
            if ($customerId === null || (int) $promotion->restricted_customer_id !== $customerId) {
                return $this->reject('This promo code is not valid for your account.');
            }
        }

        $order->loadMissing('items');
        $subtotalLaar = (int) ($order->subtotal_laar ?? round((float) $order->subtotal * 100));
        if ($subtotalLaar <= 0) {
            $subtotalLaar = (int) round((float) $order->items->sum('total_price') * 100);
        }

        if ($promotion->min_order_laar && $subtotalLaar < (int) $promotion->min_order_laar) {
            $minMvr = number_format($promotion->min_order_laar / 100, 2);

            return $this->reject("Minimum order of MVR {$minMvr} required.");
        }

        if ($customerId && $promotion->max_uses_per_customer) {
            $confirmedUsage = $this->redemptionRepo->countByPromotionAndCustomer($promotion->id, $customerId);
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

        $firstOrderCheck = $this->firstOrderGate($promotion, $customerId, $excludeOrderId);
        if ($firstOrderCheck !== null) {
            return $this->reject($firstOrderCheck);
        }

        $discountLaar = $this->calculateDiscount($promotion, $order, $subtotalLaar);
        $isDeliveryWaive = $this->isDeliveryWaiver($promotion);
        if ($discountLaar <= 0 && !$isDeliveryWaive) {
            return $this->reject('Promo code does not apply to any items in your order.');
        }

        $budgetCheck = $this->budgetGate($promotion, $discountLaar);
        if ($budgetCheck !== null) {
            return $this->reject($budgetCheck);
        }

        return [
            'valid' => true,
            'discount_laar' => $discountLaar,
            'message' => 'Automatic promotion applied.',
            'promotion' => $promotion,
        ];
    }

    /**
     * Preview a promo against POS cart lines without persisting an order.
     *
     * @param array<int, array{item_id: int, quantity?: numeric, unit_price: numeric, total_price?: numeric}> $lines
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

        $firstOrderCheck = $this->firstOrderGate($promotion, $customerId, $excludeOrderId);
        if ($firstOrderCheck !== null) {
            return $this->reject($firstOrderCheck);
        }

        $discountLaar = $this->calculateDiscount($promotion, $order, $subtotalLaar);
        $isDeliveryWaive = $this->isDeliveryWaiver($promotion);

        if ($discountLaar <= 0 && !$isDeliveryWaive) {
            return $this->reject('Promo code does not apply to any items in your order.');
        }

        $budgetCheck = $this->budgetGate($promotion, $discountLaar);
        if ($budgetCheck !== null) {
            return $this->reject($budgetCheck);
        }

        return [
            'valid' => true,
            'discount_laar' => $discountLaar,
            'message' => 'Promo code applied successfully.',
            'promotion' => $promotion,
        ];
    }

    /**
     * @param array<int, array{item_id: int, quantity?: numeric, unit_price: numeric, total_price?: numeric}> $lines
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

        $raw = match ($promo->type) {
            'percentage' => (int) floor($applicableAmount * $promo->discount_value / 100),
            'fixed' => min((int) $promo->discount_value, $applicableAmount),
            'free_item' => $this->freeItemDiscount($promo, $order),
            'tiered' => $this->tieredDiscount($promo, $applicableAmount > 0 ? $applicableAmount : $subtotalLaar),
            'quantity_break' => $this->quantityBreakDiscount($promo, $order),
            'buy_x_get_y' => $this->buyXGetYDiscount($promo, $order),
            'free_delivery' => 0,
            default => 0,
        };

        $raw = max(0, min($raw, $applicableAmount > 0 ? $applicableAmount : $subtotalLaar));

        return $this->applyMarginFloor($promo, $order, $raw);
    }

    public function isDeliveryWaiver(Promotion $promo): bool
    {
        return $promo->type === 'free_delivery' || (bool) $promo->waive_delivery;
    }

    /** @return string|null rejection message */
    private function budgetGate(Promotion $promotion, int $discountLaar): ?string
    {
        if ($promotion->budget_laar === null) {
            return null;
        }
        // Soft cap: spent_laar increments at redemption (order completion), while
        // this check runs at apply time — concurrent pending carts can overshoot
        // the budget slightly before any of them pay.
        $budget = (int) $promotion->budget_laar;
        $spent = (int) ($promotion->spent_laar ?? 0);
        if ($spent + $discountLaar > $budget) {
            return 'This offer has reached its limit.';
        }

        return null;
    }

    /** @return string|null rejection message */
    private function firstOrderGate(Promotion $promotion, ?int $customerId, ?int $excludeOrderId = null): ?string
    {
        if (!$promotion->first_order_only) {
            return null;
        }
        // Guests (no linked customer) count as first-order eligible.
        if ($customerId === null) {
            return null;
        }

        $query = Order::query()
            ->where('customer_id', $customerId)
            ->where(function ($q): void {
                $q->whereIn('payment_status', ['paid', 'partial'])
                    ->orWhereIn('status', ['completed', 'delivered', 'ready', 'preparing', 'confirmed', 'paid', 'in_progress']);
            })
            ->whereNotIn('status', ['cancelled', 'refunded']);

        if ($excludeOrderId !== null) {
            $query->where('id', '!=', $excludeOrderId);
        }

        if ($query->exists()) {
            return 'This offer is only available on your first order.';
        }

        return null;
    }

    private function tieredDiscount(Promotion $promo, int $subtotalLaar): int
    {
        $tiers = $promo->metadata['tiers'] ?? null;
        if (!is_array($tiers) || $tiers === []) {
            return 0;
        }

        $best = null;
        $bestMin = -1;
        foreach ($tiers as $tier) {
            if (!is_array($tier)) {
                continue;
            }
            $min = (int) ($tier['min_laar'] ?? 0);
            if ($subtotalLaar < $min || $min < $bestMin) {
                continue;
            }
            $bestMin = $min;
            $best = $tier;
        }
        if ($best === null) {
            return 0;
        }

        return $this->kindValueDiscount(
            (string) ($best['kind'] ?? 'fixed'),
            (int) ($best['value'] ?? 0),
            $subtotalLaar,
        );
    }

    private function quantityBreakDiscount(Promotion $promo, Order $order): int
    {
        $meta = is_array($promo->metadata) ? $promo->metadata : [];
        $minQty = max(1, (int) ($meta['min_qty'] ?? 0));
        if ($minQty <= 0) {
            return 0;
        }

        $lines = $this->qualifyingLines($promo, $order);
        $qty = (int) $lines->sum(fn (OrderItem $i) => (int) $i->quantity);
        if ($qty < $minQty) {
            return 0;
        }

        $amount = (int) $lines->sum(fn (OrderItem $i) => LaariConverter::toLaar($i->total_price));

        return $this->kindValueDiscount(
            (string) ($meta['kind'] ?? 'percentage'),
            (int) ($meta['value'] ?? 0),
            $amount,
        );
    }

    private function buyXGetYDiscount(Promotion $promo, Order $order): int
    {
        $meta = is_array($promo->metadata) ? $promo->metadata : [];
        $buyQty = max(1, (int) ($meta['buy_qty'] ?? 0));
        $getQty = max(1, (int) ($meta['get_qty'] ?? 0));
        $getPct = max(0, min(100, (int) ($meta['get_discount_pct'] ?? 100)));
        $cheapest = array_key_exists('cheapest', $meta) ? (bool) $meta['cheapest'] : true;
        $setSize = $buyQty + $getQty;
        if ($buyQty <= 0 || $getQty <= 0) {
            return 0;
        }

        // Expand qualifying lines into unit prices (laari).
        $units = [];
        foreach ($this->qualifyingLines($promo, $order) as $line) {
            $unitLaar = LaariConverter::toLaar($line->unit_price);
            $q = max(0, (int) $line->quantity);
            for ($i = 0; $i < $q; $i++) {
                $units[] = $unitLaar;
            }
        }
        if ($units === []) {
            return 0;
        }

        $sets = intdiv(count($units), $setSize);
        if ($sets <= 0) {
            return 0;
        }

        if ($cheapest) {
            sort($units); // ascending — discount the cheapest get units
        } else {
            rsort($units);
        }

        $discountUnits = array_slice($units, 0, $sets * $getQty);
        $discount = 0;
        foreach ($discountUnits as $unit) {
            $discount += (int) floor($unit * $getPct / 100);
        }

        return min($discount, (int) array_sum($units));
    }

    private function kindValueDiscount(string $kind, int $value, int $amountLaar): int
    {
        if ($amountLaar <= 0 || $value <= 0) {
            return 0;
        }

        return match ($kind) {
            'percentage' => (int) floor($amountLaar * min(100, $value) / 100),
            'fixed' => min($value, $amountLaar),
            default => 0,
        };
    }

    /** @return \Illuminate\Support\Collection<int, OrderItem> */
    private function qualifyingLines(Promotion $promo, Order $order)
    {
        $order->loadMissing('items.item');
        $promo->loadMissing('targets');

        $inclusions = $promo->targets->where('is_exclusion', false);
        $exclusions = $promo->targets->where('is_exclusion', true);
        $excludedItemIds = $exclusions->where('target_type', 'item')->pluck('target_id')->all();
        $excludedCategoryIds = $exclusions->where('target_type', 'category')->pluck('target_id')->all();
        $includedItemIds = $inclusions->where('target_type', 'item')->pluck('target_id')->all();
        $includedCategoryIds = $inclusions->where('target_type', 'category')->pluck('target_id')->all();

        return $order->items->filter(function (OrderItem $orderItem) use (
            $excludedItemIds,
            $excludedCategoryIds,
            $includedItemIds,
            $includedCategoryIds,
            $inclusions,
        ) {
            $itemId = $orderItem->item_id;
            $categoryId = $orderItem->item?->category_id ?? null;
            if (in_array($itemId, $excludedItemIds, true) || in_array($categoryId, $excludedCategoryIds, true)) {
                return false;
            }
            if ($inclusions->isNotEmpty()) {
                return in_array($itemId, $includedItemIds, true)
                    || in_array($categoryId, $includedCategoryIds, true);
            }

            return true;
        })->values();
    }

    /**
     * Clamp item/category discounts so unit price stays ≥ cost × (1 + floor%).
     * Evaluates against the already-discounted line total (special baked into unit_price).
     */
    private function applyMarginFloor(Promotion $promo, Order $order, int $discountLaar): int
    {
        if ($discountLaar <= 0) {
            return 0;
        }

        if (!DiscountSettings::marginFloorEnabled()) {
            return $discountLaar;
        }

        // Floor applies to item/category-scoped discounts (not bare order-level promos).
        if ($promo->scope === 'order' && !$this->isItemLevelPromo($promo)) {
            return $discountLaar;
        }

        $floorPct = DiscountSettings::marginFloorPct();
        $lines = $this->qualifyingLines($promo, $order);
        if ($lines->isEmpty()) {
            return $discountLaar;
        }

        $maxDiscountable = 0;
        foreach ($lines as $line) {
            $qty = max(1, (int) $line->quantity);
            $unitLaar = LaariConverter::toLaar($line->unit_price); // already-discounted (special)
            $costMvr = (float) ($line->item?->cost ?? 0);
            $floorUnitLaar = (int) ceil($costMvr * (1 + $floorPct / 100) * 100);
            $minLineLaar = $floorUnitLaar * $qty;
            $lineTotal = LaariConverter::toLaar($line->total_price);
            $maxDiscountable += max(0, $lineTotal - $minLineLaar);
        }

        if ($discountLaar <= $maxDiscountable) {
            return $discountLaar;
        }

        Log::info('Promo discount clamped by margin floor', [
            'promotion_id' => $promo->id,
            'requested_laar' => $discountLaar,
            'clamped_laar' => $maxDiscountable,
            'floor_pct' => $floorPct,
        ]);

        return max(0, $maxDiscountable);
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
