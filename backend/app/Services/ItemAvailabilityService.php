<?php

declare(strict_types=1);

namespace App\Services;

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
 *  - Global online ordering gate   (OnlineOrderingGateService)
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
        private readonly OnlineOrderingGateService $gate,
        private readonly StockReservationService $reservations,
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
                availableFrom: $this->channelAvailableFrom($item, $channel, $at),
            );
        }

        // 3. Online ordering gate (only for online channels)
        if (in_array($channel, ['online_pickup', 'delivery'], true)) {
            if (! $this->gate->isOpen($at)) {
                $status = $this->gate->status($at);
                $from = is_string($status['next_open_window'] ?? null)
                    ? $status['next_open_window']
                    : null;

                return AvailabilityResult::unavailable(
                    'ordering_closed',
                    $this->gate->closedMessage(),
                    availableFrom: $from,
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
     * Wave C optional top-level aliases (non-breaking).
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function withPublicAliases(array $data, AvailabilityResult $result): array
    {
        $data['availability'] = $this->toAvailabilityBlock($result);
        $data['available_now'] = $result->allowed;
        $data['unavailable_reason'] = $result->allowed ? null : $result->reasonCode;
        $data['available_from'] = $result->availableFrom;

        return $data;
    }

    /**
     * Annotate a collection of items with availability metadata.
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
            $result[] = $this->withPublicAliases($arr, $check);
        }

        return $result;
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

    public static function unavailable(string $reasonCode, string $message, ?string $availableFrom = null): self
    {
        return new self(false, $reasonCode, $message, null, $availableFrom);
    }
}
