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
use App\Models\PromotionTarget;
use App\Models\SiteSetting;
use App\Support\LaariConverter;
use Illuminate\Support\Collection;
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
     * Promo whose discount is baked into catalog line prices by EffectivePriceService.
     * Only percentage/fixed with reward targets and NO trigger rows qualify — free_item,
     * BOGO, and trigger-gated offers must still run through applyAutomatic.
     */
    public function isItemLevelPromo(Promotion $promo): bool
    {
        if (!in_array($promo->type, ['percentage', 'fixed'], true)) {
            return false;
        }

        $promo->loadMissing('targets');
        $inclusions = $promo->targets->where('is_exclusion', false);
        if ($inclusions->contains(fn (PromotionTarget $t) => $t->isTrigger())) {
            return false;
        }

        return $inclusions->filter(fn (PromotionTarget $t) => $t->isReward())->isNotEmpty();
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
     * Re-measure the promotions already on an order against its current cart.
     *
     * Applying a promo used to be the last time anything checked it. The draft
     * row kept the laari it was worth when the ticket was bigger, so a code
     * needing MVR 500 of spend went on paying out on a MVR 100 ticket — audit,
     * 2026-09-01, where that combination settled at MVR 0.00.
     *
     * A promotion that no longer qualifies is released rather than shrunk: its
     * rules are objective, and half a promo nobody has earned is not a kinder
     * answer than none. One that still qualifies is re-priced, which matters
     * for percentage promos — 20% of a smaller cart is a smaller number.
     *
     * Releasing (not deleting) keeps the row for the ledger and frees the
     * per-customer and campaign counts it was holding.
     *
     * @return list<string> human-readable notes on what changed
     */
    public function revalidateOrderPromotions(Order $order, int $subtotalLaar): array
    {
        $drafts = OrderPromotion::query()
            ->where('order_id', $order->id)
            ->where('status', 'draft')
            ->with('promotion')
            ->get();

        if ($drafts->isEmpty()) {
            // Nothing pending, but the stored figure may still be left over
            // from a draft that was consumed or released elsewhere.
            $order->promo_discount_laar = 0;

            return [];
        }

        // The evaluator reads subtotal_laar off the order; the caller has the
        // freshly summed one, which the order row has not been given yet.
        $original = $order->subtotal_laar;
        $order->subtotal_laar = $subtotalLaar;

        $notes = [];
        $total = 0;

        try {
            foreach ($drafts as $draft) {
                $promotion = $draft->promotion;
                if ($promotion === null) {
                    continue;
                }

                $check = $this->eligibilityForPromotion(
                    $promotion,
                    $order,
                    $order->customer_id !== null ? (int) $order->customer_id : null,
                    (int) $order->id,
                );

                $wasLaar = (int) $draft->discount_laar;

                if (!$check['valid']) {
                    $draft->update(['status' => 'released', 'discount_laar' => 0]);
                    $notes[] = sprintf(
                        'Promo %s removed — %s',
                        $promotion->code ?? $promotion->name,
                        lcfirst($check['message']),
                    );

                    continue;
                }

                $nowLaar = (int) $check['discount_laar'];
                if ($nowLaar !== $wasLaar) {
                    $draft->update(['discount_laar' => $nowLaar]);
                    $notes[] = sprintf(
                        'Promo %s changed from MVR %s to MVR %s for this ticket.',
                        $promotion->code ?? $promotion->name,
                        number_format($wasLaar / 100, 2),
                        number_format($nowLaar / 100, 2),
                    );
                }

                $total += $nowLaar;
            }
        } finally {
            $order->subtotal_laar = $original;
        }

        $order->promo_discount_laar = $total;

        return $notes;
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

        $registeredCheck = $this->registeredOnlyGate($promotion, $customerId);
        if ($registeredCheck !== null) {
            return $this->reject($registeredCheck);
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

        $registeredCheck = $this->registeredOnlyGate($promotion, $customerId);
        if ($registeredCheck !== null) {
            return $this->reject($registeredCheck);
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

            // Platter children never earn triggers / free rewards.
            if (!empty($line['parent_order_item_id'])) {
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
                'parent_order_item_id' => $line['parent_order_item_id'] ?? null,
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
        // Trigger rows (if any) must be satisfied before any discount is computed.
        // Promotions with no trigger rows keep today's behaviour untouched.
        if (!$this->triggersSatisfied($promo, $order)) {
            return 0;
        }

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

    /**
     * When a promotion has trigger targets, every trigger row must be satisfied
     * (matching basket qty ≥ that row's metadata.min_qty, default 1).
     * No trigger rows → always true (legacy behaviour).
     */
    public function triggersSatisfied(Promotion $promo, Order $order): bool
    {
        $promo->loadMissing('targets');
        $triggers = $promo->targets
            ->where('is_exclusion', false)
            ->filter(fn (PromotionTarget $t) => $t->isTrigger())
            ->values();

        if ($triggers->isEmpty()) {
            return true;
        }

        $order->loadMissing('items.item');
        foreach ($triggers as $trigger) {
            $needed = $trigger->triggerMinQty();
            $have = $this->quantityMatchingTarget($order, $trigger);
            if ($have < $needed) {
                return false;
            }
        }

        return true;
    }

    private function quantityMatchingTarget(Order $order, PromotionTarget $target): float
    {
        $qty = 0.0;
        foreach ($this->candidateOrderLines($order) as $line) {
            if ($this->lineMatchesTarget($line, $target)) {
                $qty += (float) $line->quantity;
            }
        }

        return $qty;
    }

    private function lineMatchesTarget(OrderItem $line, PromotionTarget $target): bool
    {
        if ($target->target_type === 'item') {
            return (int) $line->item_id === (int) $target->target_id;
        }
        if ($target->target_type === 'category') {
            return (int) ($line->item?->category_id ?? 0) === (int) $target->target_id;
        }

        return false;
    }

    /**
     * Single place that decides which order lines a promo may look at.
     * Platter children never satisfy triggers or buy_x_get_y rewards.
     *
     * @return Collection<int, OrderItem>
     */
    private function candidateOrderLines(Order $order): Collection
    {
        $order->loadMissing('items.item');

        return $order->items->filter(function (OrderItem $line) {
            if ($line->parent_order_item_id) {
                return false;
            }

            return true;
        })->values();
    }

    /**
     * Lines that count as REWARD (discounted) side.
     * null/absent role = reward by construction.
     * Lines already consumed as a trigger are never also discounted as their own reward —
     * otherwise a customer buys one burger and gets that same burger free.
     *
     * @return Collection<int, OrderItem>
     */
    private function filterLines(Promotion $promo, Order $order, string $role = PromotionTarget::ROLE_REWARD): Collection
    {
        $promo->loadMissing('targets');
        $order->loadMissing('items.item');

        $allInclusions = $promo->targets->where('is_exclusion', false);
        $exclusions = $promo->targets->where('is_exclusion', true);

        if ($role === PromotionTarget::ROLE_TRIGGER) {
            $inclusions = $allInclusions->filter(fn (PromotionTarget $t) => $t->isTrigger())->values();
        } else {
            // Reward: explicit reward OR null/absent (legacy).
            $inclusions = $allInclusions->filter(fn (PromotionTarget $t) => $t->isReward())->values();
        }

        $excludedItemIds = $exclusions->where('target_type', 'item')->pluck('target_id')->all();
        $excludedCategoryIds = $exclusions->where('target_type', 'category')->pluck('target_id')->all();
        $includedItemIds = $inclusions->where('target_type', 'item')->pluck('target_id')->all();
        $includedCategoryIds = $inclusions->where('target_type', 'category')->pluck('target_id')->all();

        $triggerTargets = $allInclusions->filter(fn (PromotionTarget $t) => $t->isTrigger())->values();

        return $this->candidateOrderLines($order)->filter(function (OrderItem $orderItem) use (
            $excludedItemIds,
            $excludedCategoryIds,
            $includedItemIds,
            $includedCategoryIds,
            $inclusions,
            $triggerTargets,
            $role,
        ) {
            // A line consumed as a trigger must NOT also be discounted as its own reward.
            if ($role === PromotionTarget::ROLE_REWARD && $triggerTargets->isNotEmpty()) {
                foreach ($triggerTargets as $trigger) {
                    if ($this->lineMatchesTarget($orderItem, $trigger)) {
                        return false;
                    }
                }
            }

            $itemId = $orderItem->item_id;
            $categoryId = $orderItem->item?->category_id ?? null;
            if (in_array($itemId, $excludedItemIds, true) || in_array($categoryId, $excludedCategoryIds, true)) {
                return false;
            }
            if ($inclusions->isNotEmpty()) {
                return in_array($itemId, $includedItemIds, true)
                    || in_array($categoryId, $includedCategoryIds, true);
            }

            // Trigger role with no trigger inclusions → nothing matches.
            if ($role === PromotionTarget::ROLE_TRIGGER) {
                return false;
            }

            // Reward with no reward inclusions → whole-order (legacy).
            return true;
        })->values();
    }

    /**
     * Cart reward picker: earned free_item offers with a choice of reward items.
     *
     * @param  array<int, array{item_id: int, quantity?: numeric, unit_price?: numeric, total_price?: numeric}>  $lines
     * @return list<array{promotion_id: int, promotion_name: string, message: string, reward_items: list<array{id: int, name: string, base_price: float, image_url: ?string}>}>
     */
    public function earnedRewardChoices(array $lines, ?int $customerId = null): array
    {
        if ($lines === []) {
            return [];
        }

        $order = $this->ephemeralOrderFromLines($lines);
        $promos = Promotion::query()
            ->autoApply()
            ->active()
            ->where('type', 'free_item')
            ->with('targets')
            ->get();

        $out = [];
        foreach ($promos as $promo) {
            if (!$this->triggersSatisfied($promo, $order)) {
                continue;
            }

            $rewardTargets = $promo->targets
                ->where('is_exclusion', false)
                ->filter(fn (PromotionTarget $t) => $t->isReward() && $t->target_type === 'item')
                ->values();

            if ($rewardTargets->isEmpty()) {
                continue;
            }

            // Must have trigger rows — otherwise this is a legacy free_item (cheapest in cart)
            // and the picker is not needed.
            $hasTriggers = $promo->targets
                ->where('is_exclusion', false)
                ->contains(fn (PromotionTarget $t) => $t->isTrigger());
            if (!$hasTriggers) {
                continue;
            }

            $eligibility = $this->eligibilityForPromotion($promo, $order, $customerId, null);
            // eligibility requires a reward line already in the basket for free_item discount > 0.
            // For the picker we only need triggers + valid gates (dates, caps), not the discount yet.
            if (!$promo->isValid()) {
                continue;
            }
            if ($promo->max_uses && self::campaignUsageIncludingPending($promo, null) >= (int) $promo->max_uses) {
                continue;
            }
            $registeredCheck = $this->registeredOnlyGate($promo, $customerId);
            if ($registeredCheck !== null) {
                continue;
            }
            $firstOrderCheck = $this->firstOrderGate($promo, $customerId, null);
            if ($firstOrderCheck !== null) {
                continue;
            }

            $itemIds = $rewardTargets->pluck('target_id')->all();
            $items = Item::query()
                ->whereIn('id', $itemIds)
                ->where('is_active', true)
                ->get(['id', 'name', 'base_price', 'image_url', 'is_available']);

            $rewardItems = $items->map(fn (Item $item) => [
                'id' => $item->id,
                'name' => $item->name,
                'base_price' => (float) $item->base_price,
                'image_url' => $item->image_url,
                'is_available' => (bool) $item->is_available,
            ])->values()->all();

            if ($rewardItems === []) {
                continue;
            }

            $out[] = [
                'promotion_id' => $promo->id,
                'promotion_name' => $promo->name,
                'message' => "You've earned a free drink — choose one.",
                'reward_items' => $rewardItems,
            ];

            // Silence unused variable in case eligibility is useful for future gates.
            unset($eligibility);
        }

        return $out;
    }

    /**
     * Validate client-submitted reward claims. Returns null if ok, or an error message.
     *
     * @param  list<array{promotion_id: int, item_id: int}>  $claims
     * @param  array<int, array{item_id: int, quantity?: numeric, unit_price?: numeric, total_price?: numeric}>  $lines
     */
    public function validateRewardClaims(array $claims, array $lines, ?int $customerId = null): ?string
    {
        if ($claims === []) {
            return null;
        }

        $earned = $this->earnedRewardChoices($lines, $customerId);
        $earnedMap = [];
        foreach ($earned as $offer) {
            $earnedMap[$offer['promotion_id']] = array_column($offer['reward_items'], 'id');
        }

        foreach ($claims as $claim) {
            $promoId = (int) ($claim['promotion_id'] ?? 0);
            $itemId = (int) ($claim['item_id'] ?? 0);
            if ($promoId < 1 || $itemId < 1) {
                return 'Invalid reward claim.';
            }
            if (!isset($earnedMap[$promoId]) || !in_array($itemId, $earnedMap[$promoId], true)) {
                return 'This free reward is not available for your basket.';
            }
            // Claimed item must actually be in the submitted lines.
            $inBasket = false;
            foreach ($lines as $line) {
                if ((int) ($line['item_id'] ?? 0) === $itemId) {
                    $inBasket = true;
                    break;
                }
            }
            if (!$inBasket) {
                return 'Claimed reward item is not in the order.';
            }
        }

        return null;
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

    /**
     * Opt-in: reject guests when the promotion requires a registered account.
     * Default (registered_only=false) keeps guest-eligible behaviour unchanged.
     *
     * @return string|null rejection message
     */
    private function registeredOnlyGate(Promotion $promotion, ?int $customerId): ?string
    {
        if (!$promotion->registered_only) {
            return null;
        }

        if ($customerId === null) {
            return 'Sign in or create an account to use this offer.';
        }

        return null;
    }

    /** @return string|null rejection message */
    private function firstOrderGate(Promotion $promotion, ?int $customerId, ?int $excludeOrderId = null): ?string
    {
        if (!$promotion->first_order_only) {
            return null;
        }
        // Guests (no linked customer) count as first-order eligible unless
        // registered_only is set (handled by registeredOnlyGate above).
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

    /** @return Collection<int, OrderItem> */
    private function qualifyingLines(Promotion $promo, Order $order)
    {
        // Reward side only — null role counts as reward (legacy).
        return $this->filterLines($promo, $order, PromotionTarget::ROLE_REWARD);
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
     * taking into account reward inclusions/exclusions (and trigger consumption).
     */
    private function applicableSubtotal(Promotion $promo, Order $order): int
    {
        $promo->loadMissing('targets');
        $rewardInclusions = $promo->targets
            ->where('is_exclusion', false)
            ->filter(fn (PromotionTarget $t) => $t->isReward());

        if ($promo->scope === 'order' && $rewardInclusions->isEmpty() && $promo->targets->where('is_exclusion', false)->filter(fn (PromotionTarget $t) => $t->isTrigger())->isEmpty()) {
            // Legacy whole-order: no targets at all.
            if ($promo->targets->isEmpty()) {
                return (int) ($order->subtotal_laar ?? LaariConverter::toLaar($order->subtotal));
            }
        }

        $total = 0;
        foreach ($this->qualifyingLines($promo, $order) as $orderItem) {
            $total += LaariConverter::toLaar($orderItem->total_price);
        }

        return $total;
    }

    private function freeItemDiscount(Promotion $promo, Order $order): int
    {
        // Free item = cheapest REWARD item already in the basket (not a trigger line).
        $rewardLines = $this->qualifyingLines($promo, $order)
            ->filter(function (OrderItem $line) use ($promo) {
                $rewardItemIds = $promo->targets
                    ->where('is_exclusion', false)
                    ->filter(fn (PromotionTarget $t) => $t->isReward() && $t->target_type === 'item')
                    ->pluck('target_id')
                    ->all();

                return $rewardItemIds === [] || in_array((int) $line->item_id, array_map('intval', $rewardItemIds), true);
            })
            ->sortBy('unit_price');

        $cheapestItem = $rewardLines->first();
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
