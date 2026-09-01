<?php

declare(strict_types=1);

namespace App\Services;

use App\Domains\Inventory\Services\RecipeStockService;
use App\Domains\Kitchen\Services\KitchenMenuResolver;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
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
    public function __construct(
        private readonly KitchenMenuResolver $menuResolver,
        private readonly StockReservationService $reservations,
        private readonly RecipeStockService $recipeStock,
    ) {}

    /**
     * Full availability check for a single item on a given channel.
     *
     * @param string $channel One of: dine_in, takeaway, online_pickup, delivery
     */
    public function check(Item $item, string $channel, ?Carbon $at = null): AvailabilityResult
    {
        $at ??= now();

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
        if (!$this->menuResolver->isItemVisibleForChannel($item, $channel, $at)) {
            return AvailabilityResult::unavailable(
                'channel_unavailable',
                "This item is not available for {$channel} orders right now.",
                availableFrom: $this->channelAvailableFrom($item, $channel, $at),
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

            return AvailabilityResult::available(availableStock: $available);
        }

        return AvailabilityResult::available(availableStock: $portions);
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
     */
    public function isLowStock(Item $item, AvailabilityResult $result): bool
    {
        if (!$result->allowed) {
            return false;
        }
        if (!$item->track_stock || $item->availability_type !== 'stock_based') {
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
     * True unless this is a sized dish whose every size is off.
     *
     * A size is pickable when it is active (on the menu at all) and available
     * (not sold out today). An item with no sizes is not affected.
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

        return $variants->contains(
            fn (\App\Models\Variant $v) => $v->is_active && $v->isAvailableNow(),
        );
    }

    private function channelAvailableFrom(Item $item, string $channel, Carbon $at): ?string
    {
        $row = ItemChannelAvailability::query()
            ->where('item_id', $item->id)
            ->where('channel', $channel)
            ->first();

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
