<?php

declare(strict_types=1);

namespace App\Services;

use App\Domains\Inventory\Services\RecipeStockService;
use App\Domains\Kitchen\Services\KitchenMenuResolver;
use App\Models\Item;
use App\Models\Variant;
use Carbon\Carbon;

/**
 * Single source of truth for item availability across customer-facing contexts.
 *
 * Consolidates:
 *  - Menu-group / chef-duty check  (KitchenMenuResolver)
 *  - Per-channel availability      (ItemChannelAvailability rows)
 *  - Stock availability            (StockReservationService)
 *
 * The online ordering gate (OnlineOrderingGateService) is a shop-level
 * condition enforced at order creation via assertOpen() — deliberately not
 * applied per item. Stamping "ordering_closed" onto every dish makes the
 * whole menu unbrowsable while the kitchen is shut.
 *
 * Returns a structured AvailabilityResult instead of a plain bool, so
 * callers can surface the reason and the next-open window without
 * making separate calls.  All existing bool-based callers remain
 * compatible — they just call ->allowed.
 *
 * Wave C public aliases (non-breaking): available_now, unavailable_reason, available_from.
 */
class ItemAvailabilityService
{
    /** Channels on which a dish's notice period is enforced. */
    public const NOTICE_CHANNELS = ['online_pickup', 'delivery'];

    public function __construct(
        private readonly KitchenMenuResolver $menuResolver,
        private readonly StockReservationService $reservations,
        private readonly RecipeStockService $recipeStock,
        private readonly TomorrowDailyCapacityService $dailyCapacity,
    ) {}

    /**
     * What is left of the item's daily cap for today, or null when it has none.
     */
    private function remainingToday(Item $item, Carbon $at): ?int
    {
        if ($item->tomorrow_daily_capacity === null) {
            return null;
        }

        return $this->dailyCapacity->remainingMap([$item], $at->toDateString())[(int) $item->id] ?? null;
    }

    /**
     * Full availability check for a single item on a given channel.
     *
     * @param string $channel One of: dine_in, takeaway, online_pickup, delivery
     */
    public function check(Item $item, string $channel, ?Carbon $at = null): AvailabilityResult
    {
        return $this->evaluate($item, $channel, $at ?? now());
    }

    /**
     * Is the dish on the menu today, whichever way somebody would order it.
     *
     * The website menu (owner, 2026-09-21: "if the item is out of stock, I
     * want the customers to see and click even though it's dimmed") reads
     * this. It is a menu to read, not a channel to order on, so the channel
     * switches and menu-group hours are left out: a dish that is takeaway-only
     * is not "sold out", and neither is a breakfast dish at three in the
     * afternoon. Everything that means the kitchen cannot serve it — the
     * Sold out toggle, the snooze, stock, the ingredient pool, a bundle's
     * parts — still counts.
     */
    public function checkAnyChannel(Item $item, ?Carbon $at = null): AvailabilityResult
    {
        return $this->evaluate($item, null, $at ?? now());
    }

    private function evaluate(Item $item, ?string $channel, Carbon $at): AvailabilityResult
    {
        // 1. Item-level flags
        if (!$item->is_active) {
            return AvailabilityResult::unavailable('item_inactive', 'This item is currently unavailable.');
        }
        if (!$item->is_available) {
            return AvailabilityResult::unavailable('item_unavailable', 'This item is currently unavailable.');
        }

        if ($item->isSnoozed($at)) {
            return AvailabilityResult::unavailable(
                'snoozed',
                'Unavailable today',
                availableFrom: $item->snoozed_until?->toIso8601String(),
            );
        }

        // 2. Channel + menu-group check
        if ($channel !== null && !$this->menuResolver->isItemVisibleForChannel($item, $channel, $at)) {
            return AvailabilityResult::unavailable(
                'channel_unavailable',
                "This item is not available for {$channel} orders right now.",
                availableFrom: $this->channelAvailableFrom($item, $channel, $at),
            );
        }

        // 2b. Notice. A dish that needs 48 hours cannot be had today; the
        // customer is pointed at the event wizard. Only the online channels
        // ask — the till serves whoever is at the counter, and the website
        // menu is a menu, not an order.
        $lead = (int) ($item->lead_time_hours ?? 0);
        if ($lead > 0 && in_array($channel, self::NOTICE_CHANNELS, true)
            && $at->copy()->addHours($lead)->gt($at->copy()->endOfDay())) {
            return AvailabilityResult::unavailable(
                'needs_notice',
                "Needs {$lead} hours' notice",
            );
        }

        // 3. A dish sold in sizes needs at least one size somebody can pick.
        // Without this the tile stays enabled, the customer opens it, and every
        // size is greyed out — a dead end nobody can act on.
        if (!$this->hasSellableSize($item)) {
            return AvailabilityResult::unavailable(
                'out_of_stock',
                "{$item->name} is currently sold out.",
                availableStock: 0,
            );
        }

        // 4. Shared ingredient pool (opt-in per recipe). For a dish sold in
        // sizes this is the best any size can still do: the item stays on the
        // menu while one size is makeable, and the size picker says which.
        $portions = $this->recipeStock->portionsForItem($item);
        if ($portions !== null && $portions <= 0) {
            return AvailabilityResult::unavailable(
                'out_of_stock',
                "{$item->name} is currently sold out.",
                availableStock: 0,
            );
        }

        // 4b. "Most you can make in a day", today's share of it. Whatever
        // is left joins the count the menu shows, so a dish capped at ten
        // reads "Only 2 left" and then "Sold out" like any other.
        $dayLeft = $this->remainingToday($item, $at);
        if ($dayLeft !== null) {
            if ($dayLeft <= 0) {
                return AvailabilityResult::unavailable(
                    'out_of_stock',
                    "{$item->name} is sold out for today.",
                    availableStock: 0,
                );
            }
            $portions = $portions === null ? $dayLeft : min($portions, $dayLeft);
        }

        // 5. Stock check (for prepared items only)
        if ($item->track_stock && $item->availability_type === 'stock_based') {
            $available = $this->reservations->getAvailableStock($item);
            if ($portions !== null) {
                $available = min($available, $portions);
            }
            if ($available <= 0) {
                return AvailabilityResult::unavailable(
                    'out_of_stock',
                    "{$item->name} is currently sold out.",
                    availableStock: 0,
                );
            }

            $fromChildren = $this->bundleChildBlock($item, $at);
            if ($fromChildren !== null) {
                return $fromChildren;
            }

            return AvailabilityResult::available(availableStock: $available);
        }

        $fromChildren = $this->bundleChildBlock($item, $at);
        if ($fromChildren !== null) {
            return $fromChildren;
        }

        return AvailabilityResult::available(availableStock: $portions);
    }

    /**
     * A bundle is only as available as the things inside it.
     *
     * Owner's audit, 2026-09-06 (F3): nothing about a bundle's availability
     * looked at its children. The only child check happened at order time, in
     * `ComboChildStockService`, and it checked *stock* — so a child switched
     * off with the "Sold out" toggle, which is how a kitchen 86s a dish, was
     * skipped entirely. The bundle stayed on the menu, sold, and could not be
     * made.
     *
     * Required children only: an optional one is by definition something the
     * customer might not get. Platters are excluded — their contents are
     * chosen at order time and each pick is checked as it is picked.
     *
     * Returns null when nothing is wrong, so the caller keeps its own answer.
     */
    private function bundleChildBlock(Item $item, Carbon $at): ?AvailabilityResult
    {
        if (!$item->is_combo || $item->isPlatter()) {
            return null;
        }

        $rows = $item->relationLoaded('comboItems')
            ? $item->comboItems
            : $item->comboItems()->with(['item', 'variant'])->get();

        $soldOut = AvailabilityResult::unavailable(
            'out_of_stock',
            "{$item->name} is currently sold out.",
            availableStock: 0,
        );

        foreach ($rows as $row) {
            if ($row->is_optional) {
                continue;
            }

            $child = $row->item;
            if ($child === null) {
                continue;
            }
            $variant = $row->variant_id
                ? ($row->relationLoaded('variant') ? $row->variant : $row->variant()->first())
                : null;
            $needed = max(1, (int) $row->quantity);

            /*
             * The child's own flags and stock, not a full recursive `check`:
             * a child is not being sold on this channel, it is being *used*,
             * so its channel switches and menu group say nothing about whether
             * the kitchen can make it.
             */
            if (!$child->is_active || !$child->is_available || $child->isSnoozed($at)) {
                return $soldOut;
            }
            if ($variant && (!$variant->is_active || !$variant->isAvailableNow())) {
                return $soldOut;
            }

            // The child's ingredient pool, at the size's rate (2026-09-07
            // audit, finding 1): a bundle is only as makeable as its parts.
            $portions = $this->recipeStock->portionsAvailable($child, $variant);
            if ($portions !== null && $portions < $needed) {
                return $soldOut;
            }

            if ($variant && $variant->track_stock) {
                if ($this->reservations->getAvailableVariantStock($variant) < $needed) {
                    return $soldOut;
                }
            } elseif ($child->track_stock && $child->availability_type === 'stock_based') {
                if ($this->reservations->getAvailableStock($child) < $needed) {
                    return $soldOut;
                }
            }
        }

        return null;
    }

    /**
     * Convenience: returns true/false for use in assert-style callers.
     */
    public function isAvailable(Item $item, string $channel, ?Carbon $at = null): bool
    {
        return $this->check($item, $channel, $at)->allowed;
    }

    /**
     * Nested `availability` block for API responses.
     *
     * @return array{available: bool, reason_code: ?string, reason_message: ?string, available_stock: ?int, available_from: ?string}
     */
    public function toAvailabilityBlock(AvailabilityResult $result): array
    {
        return [
            'available' => $result->allowed,
            'reason_code' => $result->reasonCode,
            'reason_message' => $result->message !== '' ? $result->message : null,
            'available_stock' => $result->availableStock,
            'available_from' => $result->availableFrom,
        ];
    }

    /**
     * Server-side low-stock flag. Threshold stays admin-only — never expose it publicly.
     *
     * Whatever counted the portions counts here: the item's own stock, or the
     * ingredient pool when the recipe limits availability. A dish limited by
     * its ingredients used to go straight from normal to "Sold out" with no
     * "Few left" in between, because only tracked stock was looked at.
     * `availableStock` is null whenever nothing counts, so an untracked dish
     * with an open recipe is never flagged.
     */
    public function isLowStock(Item $item, AvailabilityResult $result): bool
    {
        if (!$result->allowed) {
            return false;
        }

        $stock = $result->availableStock;
        if ($stock === null || $stock >= 9999 || $stock <= 0) {
            return false;
        }

        $threshold = max(0, (int) ($item->low_stock_threshold ?? 5));

        return $stock <= $threshold;
    }

    /**
     * Wave C optional top-level aliases (non-breaking).
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function withPublicAliases(array $data, AvailabilityResult $result, ?Item $item = null): array
    {
        $data['availability'] = $this->toAvailabilityBlock($result);
        $data['available_now'] = $result->allowed;
        $data['unavailable_reason'] = $result->allowed ? null : $result->reasonCode;
        $data['available_from'] = $result->availableFrom;
        $data['is_low_stock'] = $item ? $this->isLowStock($item, $result) : false;
        $note = $item?->unavailable_reason_note;
        $data['unavailable_reason_note'] = (!$result->allowed && is_string($note) && trim($note) !== '')
            ? trim($note)
            : null;

        return $data;
    }

    /**
     * Annotate a collection of items with availability metadata.
     *
     * @param iterable<Item> $items
     * @return array<int, array<string, mixed>>
     */
    public function annotate(iterable $items, string $channel, ?Carbon $at = null): array
    {
        $result = [];
        foreach ($items as $item) {
            $arr = $item->toArray();
            $check = $this->check($item, $channel, $at);
            $result[] = $this->withPublicAliases($arr, $check, $item);
        }

        return $result;
    }

    /**
     * What a menu feed says about one size: how many are left, when anything
     * counts them, and whether a customer can pick it.
     *
     * Three things take a size off: the owner marked it sold out today, the
     * shared ingredient pool no longer covers it, or its own tracked stock
     * has run out (minus the online holds not yet released). The third was
     * missing until 2026-09-21 — a size with "Track stock" on and nothing
     * left looked pickable in both apps, and the customer found out at
     * checkout. The public and POS feeds both read this so they cannot drift.
     *
     * @param array<int, int> $variantPortions From RecipeStockService::portionsByVariant().
     * @return array{available_stock?: int, is_available?: bool}
     */
    public function sizeFields(Variant $variant, array $variantPortions): array
    {
        $soldOut = !$variant->isAvailableNow();
        $left = $this->sizeLeft($variant, $variantPortions);

        if ($left !== null) {
            return ['available_stock' => $left, 'is_available' => !$soldOut && $left > 0];
        }

        return $soldOut ? ['is_available' => false] : [];
    }

    /**
     * Portions of this size still to be had, or null when nothing counts.
     *
     * @param array<int, int> $variantPortions
     */
    private function sizeLeft(Variant $variant, array $variantPortions): ?int
    {
        $left = $variantPortions[(int) $variant->id] ?? null;

        if ($variant->track_stock) {
            $stock = $this->reservations->variantStockLeft($variant);
            $left = $left === null ? $stock : min($left, $stock);
        }

        return $left;
    }

    /**
     * Can somebody pick this size right now: on the menu, not marked sold
     * out today, and with stock left if it tracks any.
     */
    public function sizeSellable(Variant $variant): bool
    {
        return (bool) $variant->is_active
            && $variant->isAvailableNow()
            && (!$variant->track_stock || $this->reservations->variantStockLeft($variant) > 0);
    }

    /**
     * True unless this is a sized dish whose every size is off.
     *
     * A size is pickable when it is active (on the menu at all), available
     * (not sold out today) and, if it tracks its own stock, has some left.
     * An item with no sizes is not affected.
     *
     * Queries when the relation is not loaded rather than assuming: an answer
     * that changes with eager loading is worse than an extra query, and the
     * feeds that call this in a loop already load variants.
     */
    private function hasSellableSize(Item $item): bool
    {
        if (!$item->has_variants) {
            return true;
        }

        $variants = $item->relationLoaded('variants')
            ? $item->variants
            : $item->variants()->get();

        if ($variants->isEmpty()) {
            return true;
        }

        return $variants->contains(fn (Variant $v) => $this->sizeSellable($v));
    }

    private function channelAvailableFrom(Item $item, string $channel, Carbon $at): ?string
    {
        $row = $item->channelAvailabilityFor($channel);

        if ($row && $row->is_enabled && $row->valid_from && $at->lt($row->valid_from)) {
            return $row->valid_from->toIso8601String();
        }

        return null;
    }
}

/**
 * Value object returned by ItemAvailabilityService::check().
 *
 * @internal  Use ItemAvailabilityService — do not instantiate directly.
 */
final class AvailabilityResult
{
    private function __construct(
        public readonly bool $allowed,
        public readonly ?string $reasonCode,
        public readonly string $message,
        public readonly ?int $availableStock,
        public readonly ?string $availableFrom = null,
    ) {}

    public static function available(?int $availableStock = null): self
    {
        return new self(true, null, '', $availableStock, null);
    }

    public static function unavailable(
        string $reasonCode,
        string $message,
        ?string $availableFrom = null,
        ?int $availableStock = null,
    ): self {
        return new self(false, $reasonCode, $message, $availableStock, $availableFrom);
    }
}
