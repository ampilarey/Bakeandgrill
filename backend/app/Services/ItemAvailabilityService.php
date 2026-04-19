<?php

declare(strict_types=1);

namespace App\Services;

use App\Domains\Kitchen\Services\KitchenMenuResolver;
use App\Models\Item;
use Carbon\Carbon;

/**
 * Single source of truth for item availability across all contexts.
 *
 * Consolidates:
 *  - Menu-group / chef-duty check  (KitchenMenuResolver)
 *  - Per-channel availability      (ItemChannelAvailability rows)
 *  - Stock availability            (StockReservationService)
 *  - Global online ordering gate   (OnlineOrderingGateService)
 *
 * Returns a structured AvailabilityResult instead of a plain bool, so
 * callers can surface the reason and the next-open window without
 * making separate calls.  All existing bool-based callers remain
 * compatible — they just call ->allowed.
 */
class ItemAvailabilityService
{
    public function __construct(
        private readonly KitchenMenuResolver    $menuResolver,
        private readonly OnlineOrderingGateService $gate,
        private readonly StockReservationService   $reservations,
    ) {}

    /**
     * Full availability check for a single item on a given channel.
     *
     * @param  string  $channel  One of: dine_in, takeaway, online_pickup, delivery
     */
    public function check(Item $item, string $channel, ?Carbon $at = null): AvailabilityResult
    {
        $at ??= now();

        // 1. Item-level flags
        if (! $item->is_active) {
            return AvailabilityResult::unavailable('item_inactive', 'This item is currently unavailable.');
        }
        if (! $item->is_available) {
            return AvailabilityResult::unavailable('item_unavailable', 'This item is currently unavailable.');
        }

        // 2. Channel + menu-group check
        if (! $this->menuResolver->isItemVisibleForChannel($item, $channel, $at)) {
            return AvailabilityResult::unavailable(
                'channel_unavailable',
                "This item is not available for {$channel} orders right now.",
            );
        }

        // 3. Online ordering gate (only for online channels)
        if (in_array($channel, ['online_pickup', 'delivery'], true)) {
            if (! $this->gate->isOpen($at)) {
                return AvailabilityResult::unavailable(
                    'ordering_closed',
                    $this->gate->closedMessage(),
                );
            }
        }

        // 4. Stock check (for prepared items only)
        if ($item->track_stock && $item->availability_type === 'stock_based') {
            $available = $this->reservations->getAvailableStock($item);
            if ($available <= 0) {
                return AvailabilityResult::unavailable(
                    'out_of_stock',
                    "{$item->name} is currently sold out.",
                );
            }

            return AvailabilityResult::available(availableStock: $available);
        }

        return AvailabilityResult::available();
    }

    /**
     * Convenience: returns true/false for use in assert-style callers.
     */
    public function isAvailable(Item $item, string $channel, ?Carbon $at = null): bool
    {
        return $this->check($item, $channel, $at)->allowed;
    }

    /**
     * Annotate a collection of items with availability metadata.
     * Adds an `availability` key to each item's array representation.
     *
     * @param  iterable<Item>  $items
     * @return array<int, array<string, mixed>>
     */
    public function annotate(iterable $items, string $channel, ?Carbon $at = null): array
    {
        $result = [];
        foreach ($items as $item) {
            $arr = $item->toArray();
            $check = $this->check($item, $channel, $at);
            $arr['availability'] = [
                'available'       => $check->allowed,
                'reason_code'     => $check->reasonCode,
                'reason_message'  => $check->message,
                'available_stock' => $check->availableStock,
            ];
            $result[] = $arr;
        }

        return $result;
    }
}

/**
 * Value object returned by ItemAvailabilityService::check().
 * @internal  Use ItemAvailabilityService — do not instantiate directly.
 */
final class AvailabilityResult
{
    private function __construct(
        public readonly bool    $allowed,
        public readonly ?string $reasonCode,
        public readonly string  $message,
        public readonly ?int    $availableStock,
    ) {}

    public static function available(?int $availableStock = null): self
    {
        return new self(true, null, '', $availableStock);
    }

    public static function unavailable(string $reasonCode, string $message): self
    {
        return new self(false, $reasonCode, $message, null);
    }
}
