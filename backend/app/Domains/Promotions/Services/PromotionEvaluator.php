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
    public const PER_CUSTOMER_NEEDS_CUSTOMER = 'This offer is limited per customer, so the order needs a customer on it. Sign in, or ask the cashier to add you.';

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

        $policy = DiscountSettings::stackingPolicy();
        $selected = $this->selectByStackingPolicy($eligible, $policy);
        $selected = $this->againstCodesOnOrder($order, $selected, $policy);

        $applied = [];
        foreach ($selected as $row) {
            /** @var Promotion $promotion */
            $promotion = $row['promotion'];
            $discountLaar = (int) $row['discount_laar'];
            $idempotencyKey = 'order-promo:' . $order->id . ':' . $promotion->id;

            $row = OrderPromotion::firstOrCreate(
                ['idempotency_key' => $idempotencyKey],
                [
                    'order_id' => $order->id,
                    'promotion_id' => $promotion->id,
                    'discount_laar' => $discountLaar,
                    'status' => 'draft',
                ],
            );
            // Released earlier (the ticket lost the offer, say on a switch to takeaway) and
            // eligible again now (switched back to dine-in, 2026-11-08): the same row is the draft.
            if ($row->status === 'released') {
                $row->update(['status' => 'draft', 'discount_laar' => $discountLaar]);
            }

            $applied[] = $row;
        }

        $totalPromoDiscount = (int) OrderPromotion::where('order_id', $order->id)
            ->where('status', 'draft')
            ->sum('discount_laar');

        $order->update(['promo_discount_laar' => $totalPromoDiscount]);

        return $applied;
    }

    /**
     * Best one wins counts a code already on the ticket too (discount audit, 2026-11-10): the
     * bigger of the code and the best automatic offer stays, never both. The loser is released,
     * or left out. Free delivery is beside the point and always stays.
     *
     * @param list<array{promotion: Promotion, discount_laar: int}> $selected
     * @return list<array{promotion: Promotion, discount_laar: int}>
     */
    private function againstCodesOnOrder(Order $order, array $selected, string $policy): array
    {
        if ($policy === 'stack' || !$order->exists) {
            return $selected;
        }
        $coded = $this->merchandiseDrafts($order)->filter(fn (OrderPromotion $d) => !$d->promotion->auto_apply);
        if ($coded->isEmpty()) {
            return $selected;
        }
        $codedLaar = (int) $coded->sum('discount_laar');
        $autoLaar = 0;
        foreach ($selected as $row) {
            if (!$this->isDeliveryWaiver($row['promotion'])) {
                $autoLaar += (int) $row['discount_laar'];
            }
        }
        if ($autoLaar > $codedLaar) {
            foreach ($coded as $draft) {
                $draft->update(['status' => 'released']);
            }

            return $selected;
        }

        return array_values(array_filter($selected, fn (array $row) => $this->isDeliveryWaiver($row['promotion'])));
    }

    /** @return Collection<int, OrderPromotion> the drafts on an order that take money off the items */
    private function merchandiseDrafts(Order $order): Collection
    {
        return OrderPromotion::query()
            ->where('order_id', $order->id)
            ->where('status', 'draft')
            ->with('promotion')
            ->get()
            ->filter(fn (OrderPromotion $d) => $d->promotion !== null && !$this->isDeliveryWaiver($d->promotion))
            ->values();
    }

    /**
     * Put a code that passed evaluate() on an order, by the rule in Promotions → Controls → When
     * offers overlap (discount audit, 2026-11-10; before, a code's own "stackable" tick decided,
     * so a 5% code replaced a 20% automatic offer, and a stackable one added to it under Best one
     * wins). Best one wins: the bigger of this code and what is already on the ticket stays, and
     * a smaller code is refused with the reason. Add them up: everything stays. Free delivery
     * always goes on beside the rest. The caller holds the order's row lock and recalculates.
     *
     * @return array{applied: bool, message: ?string}
     */
    public function attachCode(Order $order, Promotion $promotion, int $discountLaar): array
    {
        if (DiscountSettings::stackingPolicy() !== 'stack' && !$this->isDeliveryWaiver($promotion)) {
            $others = $this->merchandiseDrafts($order)->filter(fn (OrderPromotion $d) => (int) $d->promotion_id !== (int) $promotion->id);
            $othersLaar = (int) $others->sum('discount_laar');
            if ($others->isNotEmpty() && $othersLaar >= $discountLaar) {
                $first = $others->first()->promotion;
                $name = $first->auto_apply ? $first->name : ($first->code ?? $first->name);

                return ['applied' => false, 'message' => sprintf(
                    'This ticket already has %s (MVR %s off), which is more than this code gives (MVR %s). The bigger one stays.',
                    $name,
                    number_format($othersLaar / 100, 2),
                    number_format($discountLaar / 100, 2),
                )];
            }
            foreach ($others as $other) {
                $other->update(['status' => 'released']);
            }
        }

        $row = OrderPromotion::firstOrCreate(
            ['idempotency_key' => 'order-promo:' . $order->id . ':' . $promotion->id],
            [
                'order_id' => $order->id,
                'promotion_id' => $promotion->id,
                'discount_laar' => $discountLaar,
                'status' => 'draft',
            ],
        );
        // Removed earlier and typed again: the same row is the draft again (it used to stay
        // released, so the till said "applied" and took nothing off).
        if (!$row->wasRecentlyCreated && $row->status !== 'consumed') {
            $row->update(['status' => 'draft', 'discount_laar' => $discountLaar]);
        }

        $order->update(['promo_discount_laar' => (int) OrderPromotion::where('order_id', $order->id)
            ->where('status', 'draft')
            ->sum('discount_laar')]);

        return ['applied' => true, 'message' => null];
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
        // An offer for some orders only cannot sit in the menu prices every order sees.
        if ($promo->isLimitedToSomeOrders()) {
            return false;
        }
        // Nor can one with a minimum order: the menu cannot know the ticket's size, so it comes
        // off at order time once the minimum is met (discount audit, 2026-11-10).
        if ((int) ($promo->min_order_laar ?? 0) > 0) {
            return false;
        }
        // Nor one limited per customer (owner, 2026-11-10: "1st 50 customers get 15% off"): the
        // menu cannot know who is buying, so it comes off the order of a customer still in limit.
        if ($promo->max_uses_per_customer) {
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
                // An automatic offer is known by its name; its code is internal.
                $kind = $promotion->auto_apply ? 'Offer' : 'Promo';
                $label = $promotion->auto_apply ? $promotion->name : ($promotion->code ?? $promotion->name);

                if (!$check['valid']) {
                    $draft->update(['status' => 'released', 'discount_laar' => 0]);
                    $reason = lcfirst($check['message']);
                    if ($promotion->auto_apply && !$promotion->isValid()) {
                        $reason = 'the offer has ended.';
                    }
                    $notes[] = sprintf('%s %s removed — %s', $kind, $label, $reason);

                    continue;
                }

                $nowLaar = (int) $check['discount_laar'];
                if ($nowLaar !== $wasLaar) {
                    $draft->update(['discount_laar' => $nowLaar]);
                    $notes[] = sprintf(
                        '%s %s changed from MVR %s to MVR %s for this ticket.',
                        $kind,
                        $label,
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

        $limit = $this->orderLimitCheck($promotion, $order);
        if ($limit !== null) {
            return $this->reject($limit);
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

        // A limit per customer means nothing without a customer. A walk-in at
        // the till, or a guest checkout, used to slip past "once per customer"
        // and "first order only" entirely; now the order needs someone on it.
        if ($customerId === null && ($promotion->max_uses_per_customer || $promotion->first_order_only)) {
            return $this->reject(self::PER_CUSTOMER_NEEDS_CUSTOMER);
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
     * What the automatic promotions would take off a cart that has not been
     * saved yet (owner, 2026-10-16: the till and the order app show the offer
     * before the customer pays). Same rules as applyAutomatic: item-level
     * offers are already in the line prices and are skipped, the stacking
     * policy picks among the rest. Nothing is written.
     *
     * @param array<int, array{item_id: int, quantity?: numeric, unit_price: numeric, total_price?: numeric}> $lines
     * @return array{discount_laar: int, promotions: list<Promotion>, ends_at: ?string}
     */
    public function previewAutomatic(array $lines, ?int $customerId = null, ?string $channel = null, ?string $type = null): array
    {
        if ($lines === []) {
            return ['discount_laar' => 0, 'promotions' => [], 'ends_at' => null];
        }

        $order = $this->ephemeralOrderFromLines($lines, $channel, $type);

        $eligible = [];
        $candidates = Promotion::query()
            ->autoApply()
            ->active()
            ->with('targets')
            ->get()
            ->filter(fn (Promotion $p) => $p->isValid());
        foreach ($candidates as $promotion) {
            if ($this->isItemLevelPromo($promotion) || $this->isDeliveryWaiver($promotion)) {
                continue;
            }
            $check = $this->eligibilityForPromotion($promotion, $order, $customerId, null);
            if ($check['valid'] && (int) $check['discount_laar'] > 0) {
                $eligible[] = ['promotion' => $promotion, 'discount_laar' => (int) $check['discount_laar']];
            }
        }

        $policy = DiscountSettings::stackingPolicy();
        $selected = $this->selectByStackingPolicy($eligible, $policy);

        $total = 0;
        $promotions = [];
        $endsAt = null;
        foreach ($selected as $row) {
            $total += (int) $row['discount_laar'];
            $promotions[] = $row['promotion'];
            // The earliest end among the offers shown: the client re-checks then.
            $end = $row['promotion']->expires_at;
            if ($end !== null && ($endsAt === null || $end->lt($endsAt))) {
                $endsAt = $end;
            }
        }

        return [
            'discount_laar' => $total,
            'promotions' => $promotions,
            'ends_at' => $endsAt?->toIso8601String(),
        ];
    }

    /**
     * Preview a promo against POS cart lines without persisting an order.
     *
     * @param array<int, array{item_id: int, quantity?: numeric, unit_price: numeric, total_price?: numeric}> $lines
     * @return array{valid: bool, discount_laar: int, message: string, promotion: ?Promotion}
     */
    public function evaluateForCart(string $code, array $lines, ?int $customerId = null, ?string $channel = null, ?string $type = null): array
    {
        if ($lines === []) {
            return $this->reject('Cart is empty.');
        }

        return $this->evaluateAgainstOrder($code, $this->ephemeralOrderFromLines($lines, $channel, $type), $customerId, null);
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

        $limit = $this->orderLimitCheck($promotion, $order);
        if ($limit !== null) {
            return $this->reject($limit);
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

        // A limit per customer means nothing without a customer. A walk-in at
        // the till, or a guest checkout, used to slip past "once per customer"
        // and "first order only" entirely; now the order needs someone on it.
        if ($customerId === null && ($promotion->max_uses_per_customer || $promotion->first_order_only)) {
            return $this->reject(self::PER_CUSTOMER_NEEDS_CUSTOMER);
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
    private function ephemeralOrderFromLines(array $lines, ?string $channel = null, ?string $type = null): Order
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
        // A cart not saved yet says where it is being rung up and its type, when known, so an
        // offer for some orders only can be judged (owner, 2026-11-08).
        if ($type !== null && $type !== '') {
            $order->type = $type;
        }
        if ($channel !== null) {
            $order->setAttribute('promo_channel', $channel);
        }

        return $order;
    }

    /**
     * Whether an offer limited to some orders (till or app, order type) may go on this one. A saved
     * order is "online" when the customer placed it (no staff on it), "till" otherwise; a cart not
     * saved yet carries what its caller said, and nothing when it is not known.
     */
    private function orderLimitCheck(Promotion $promotion, Order $order): ?string
    {
        if (!$promotion->isLimitedToSomeOrders()) {
            return null;
        }
        $channel = $order->getAttribute('promo_channel');
        if ($channel === null && $order->exists) {
            $channel = $order->user_id === null ? 'online' : 'till';
        }
        $type = $order->type !== null && $order->type !== '' ? (string) $order->type : null;

        return $promotion->orderLimitRejection(is_string($channel) ? $channel : null, $type);
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
            'percentage' => (int) floor($applicableAmount * min(100, max(0, (int) $promo->discount_value)) / 100),
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
     * @param array<int, array{item_id: int, quantity?: numeric, unit_price?: numeric, total_price?: numeric}> $lines
     * @return list<array{promotion_id: int, promotion_name: string, message: string, reward_items: list<array{id: int, name: string, base_price: float, image_url: ?string}>}>
     */
    public function earnedRewardChoices(array $lines, ?int $customerId = null, ?string $channel = null, ?string $type = null): array
    {
        if ($lines === []) {
            return [];
        }

        $order = $this->ephemeralOrderFromLines($lines, $channel, $type);
        $promos = Promotion::query()
            ->autoApply()
            ->active()
            ->where('type', 'free_item')
            ->with('targets')
            ->get();

        $out = [];
        foreach ($promos as $promo) {
            if ($this->orderLimitCheck($promo, $order) !== null) {
                continue;
            }
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
            // The gates the discount itself has (discount audit, 2026-11-10): the prompt used to
            // say "You've earned a free Roshi" on a ticket under the minimum order, or to someone
            // past their limit, and the customer paid for the item they added.
            if ($this->rewardGateFails($promo, $order, $customerId)) {
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

            // Say what was earned and how many (owner, 2026-11-08: it always said "a free drink").
            $count = self::freePer($promo) === 'trigger' ? max(1, $this->triggerTimes($promo, $order)) : 1;
            $what = count($rewardItems) === 1 ? (string) $rewardItems[0]['name'] : 'item';
            $out[] = [
                'promotion_id' => $promo->id,
                'promotion_name' => $promo->name,
                'message' => $count > 1
                    ? "You've earned {$count} free " . (count($rewardItems) === 1 ? $what : 'items') . ' — choose them.'
                    : "You've earned a free {$what} — " . (count($rewardItems) === 1 ? 'add it.' : 'choose one.'),
                'free_count' => $count,
                'reward_items' => $rewardItems,
            ];

            // Silence unused variable in case eligibility is useful for future gates.
            unset($eligibility);
        }

        return $out;
    }

    private function rewardGateFails(Promotion $promo, Order $order, ?int $customerId): bool
    {
        if ($promo->min_order_laar && (int) ($order->subtotal_laar ?? 0) < (int) $promo->min_order_laar) {
            return true;
        }
        if ($customerId === null && ($promo->max_uses_per_customer || $promo->first_order_only)) {
            return true;
        }
        if ($customerId !== null && $promo->max_uses_per_customer) {
            $used = $this->redemptionRepo->countByPromotionAndCustomer($promo->id, $customerId)
                + OrderPromotion::where('promotion_id', $promo->id)
                    ->where('status', 'draft')
                    ->whereHas('order', fn ($q) => $q->where('customer_id', $customerId)->whereNotIn('status', ['cancelled', 'refunded']))
                    ->count();
            if ($used >= (int) $promo->max_uses_per_customer) {
                return true;
            }
        }

        return false;
    }

    /**
     * Validate client-submitted reward claims. Returns null if ok, or an error message.
     *
     * @param list<array{promotion_id: int, item_id: int}> $claims
     * @param array<int, array{item_id: int, quantity?: numeric, unit_price?: numeric, total_price?: numeric}> $lines
     */
    public function validateRewardClaims(array $claims, array $lines, ?int $customerId = null, ?string $channel = null, ?string $type = null): ?string
    {
        if ($claims === []) {
            return null;
        }

        $earned = $this->earnedRewardChoices($lines, $customerId, $channel, $type);
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
        // No customer never reaches here: evaluateAgainstOrder rejects a
        // per-customer offer on an order with nobody on it.
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

        // One free for each item bought (owner, 2026-11-08: "1 per curry or selected item"): as
        // many of the cheapest reward units as the trigger was met, else one per order.
        if (self::freePer($promo) === 'trigger') {
            $free = $this->triggerTimes($promo, $order);
            $units = [];
            foreach ($rewardLines as $line) {
                for ($i = 0; $i < max(0, (int) $line->quantity); $i++) {
                    $units[] = LaariConverter::toLaar($line->unit_price);
                }
            }
            sort($units);

            return array_sum(array_slice($units, 0, max(1, $free)));
        }

        return LaariConverter::toLaar($cheapestItem->unit_price);
    }

    /** 'order' (one free per order, as before) or 'trigger' (one for each item bought). */
    public static function freePer(Promotion $promo): string
    {
        $meta = is_array($promo->metadata) ? $promo->metadata : [];

        return ($meta['free_per'] ?? 'order') === 'trigger' ? 'trigger' : 'order';
    }

    /**
     * How many times the basket meets the offer's triggers: for each trigger row the matching
     * quantity over its minimum, the smallest of them. No trigger rows: once.
     */
    public function triggerTimes(Promotion $promo, Order $order): int
    {
        $promo->loadMissing('targets');
        $triggers = $promo->targets
            ->where('is_exclusion', false)
            ->filter(fn (PromotionTarget $t) => $t->isTrigger())
            ->values();
        if ($triggers->isEmpty()) {
            return 1;
        }
        $order->loadMissing('items.item');
        $times = PHP_INT_MAX;
        foreach ($triggers as $trigger) {
            $needed = max(1, (int) $trigger->triggerMinQty());
            $times = min($times, (int) floor($this->quantityMatchingTarget($order, $trigger) / $needed));
        }

        return $times === PHP_INT_MAX ? 0 : $times;
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
