<?php

declare(strict_types=1);

namespace App\Services;

use App\Domains\Kitchen\Services\KitchenMenuResolver;
use App\Domains\Marketing\Services\ItemAffinityService;
use App\Models\Category;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
use Illuminate\Support\Facades\DB;

/**
 * Builds the POS menu payload (categories + channel-filtered items) in
 * batched queries — no per-item availability service calls.
 */
class PosMenuBuilder
{
    public function __construct(
        private readonly KitchenMenuResolver $kitchenMenuResolver,
        private readonly SpecialPricingService $specialPricing,
        private readonly EffectivePriceService $effectivePricing,
        private readonly ItemAffinityService $affinity,
    ) {}

    /**
     * @return array{categories: \Illuminate\Support\Collection, items: \Illuminate\Support\Collection<int, array<string, mixed>>, pairings: array<int, list<int>>}
     */
    public function build(string $channel): array
    {
        if (!in_array($channel, KitchenMenuResolver::ORDERING_CHANNELS, true)) {
            $channel = 'dine_in';
        }

        // parent_id is not optional trim — the POS builds its two-row category
        // strip from it (top-level pills, then the selected parent's children)
        // and walks it to gather an item's descendants. Owner, 2026-08-18:
        // "i have category and subcategory, but still in pos they are in same
        // line." The nesting was correct in the database and correct in the
        // POS; it was simply never selected here, so every category arrived
        // looking top-level.
        $categories = Category::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get(['id', 'parent_id', 'name', 'name_dv', 'sort_order', 'image_url']);

        $query = Item::query()
            ->with(['category:id,name', 'variants', 'modifiers', 'packagingOptions'])
            ->where('is_active', true);
        $this->kitchenMenuResolver->scopeItemsForChannel($query, $channel, null, true);

        /** @var \Illuminate\Database\Eloquent\Collection<int, Item> $items */
        $items = $query->orderBy('sort_order')->orderBy('name')->get();

        $activeGroupIds = $this->kitchenMenuResolver->activeMenuGroupIds();
        $itemIds = $items->pluck('id')->all();

        $channelRows = $itemIds === []
            ? collect()
            : ItemChannelAvailability::query()
                ->whereIn('item_id', $itemIds)
                ->where('channel', $channel)
                ->get()
                ->keyBy('item_id');

        // Catering is display-only (never an ordering channel). Flag items that
        // also have catering enabled so POS can show the Events & Catering tab.
        $cateringItemIds = $itemIds === []
            ? []
            : ItemChannelAvailability::query()
                ->whereIn('item_id', $itemIds)
                ->where('channel', 'catering')
                ->where('is_enabled', true)
                ->pluck('item_id')
                ->map(fn ($id) => (int) $id)
                ->all();
        $cateringSet = array_fill_keys($cateringItemIds, true);

        $stockItemIds = $items
            ->filter(fn (Item $item) => $item->track_stock && $item->availability_type === 'stock_based')
            ->pluck('id')
            ->all();

        $reservedByItem = [];
        if ($stockItemIds !== []) {
            // Read-only: expired rows are excluded by expires_at > now().
            // Do not DELETE on every menu load — that was adding latency under load.
            $reservedByItem = DB::table('stock_reservations')
                ->whereIn('item_id', $stockItemIds)
                ->whereNull('variant_id')
                ->where('expires_at', '>', now())
                ->groupBy('item_id')
                ->selectRaw('item_id, COALESCE(SUM(quantity), 0) as reserved')
                ->pluck('reserved', 'item_id')
                ->map(fn ($qty) => (int) $qty)
                ->all();
        }

        $at = now();
        $transformed = $items->map(function (Item $item) use (
            $activeGroupIds,
            $channelRows,
            $reservedByItem,
            $channel,
            $at,
            $cateringSet,
        ) {
            $available = $this->isPosItemAvailable(
                $item,
                $channel,
                $activeGroupIds,
                $channelRows,
                $reservedByItem,
                $at,
            );

            $variants = $item->variants
                ->sortBy('sort_order')
                ->map(function ($v) use ($item) {
                    $variantRow = [
                        'id' => $v->id,
                        'name' => $v->name,
                        'name_dv' => $v->name_dv,
                        'price' => $v->price,
                        'is_active' => $v->is_active,
                        'sort_order' => $v->sort_order,
                    ];

                    $variantPricing = $this->effectivePricing->resolveUnitPrice(
                        $item->id,
                        (float) $v->price,
                        $item,
                        $v->id,
                    );
                    if ($variantPricing->hasDiscount()) {
                        $variantRow['original_price'] = $variantPricing->originalPrice;
                        $variantRow['effective_price'] = $variantPricing->unitPrice;
                    }

                    return $variantRow;
                })
                ->values()
                ->all();

            $activeSpecial = $this->specialPricing->activeSpecialsByItemId()->get($item->id);
            $baseSpecial = $this->effectivePricing->resolveUnitPrice(
                $item->id,
                (float) $item->base_price,
                $item,
            );

            $row = [
                'id' => $item->id,
                'name' => $item->name,
                'name_dv' => $item->name_dv,
                'description' => $item->description,
                'sku' => $item->sku,
                'image_url' => $item->display_image_url,
                'base_price' => $item->base_price,
                'packaging_fee' => (float) ($item->packaging_fee ?? 0),
                'packaging_fee_mode' => (string) ($item->packaging_fee_mode ?? 'per_unit'),
                'packaging_options' => app(\App\Domains\Catalog\Services\PackagingOptionsSyncService::class)->serializeActive($item),
                'tax_rate' => $item->tax_rate,
                'is_available' => $item->is_available,
                'snoozed_until' => $item->snoozed_until?->toIso8601String(),
                'is_active' => $item->is_active,
                'sort_order' => $item->sort_order,
                'category_id' => $item->category_id,
                'menu_group_id' => $item->menu_group_id,
                'category' => $item->category ? [
                    'id' => $item->category->id,
                    'name' => $item->category->name,
                ] : null,
                'has_variants' => $item->has_variants,
                'variants' => $variants,
                'modifiers' => $item->modifiers->map(fn ($m) => [
                    'id' => $m->id,
                    'name' => $m->name,
                    'price' => $m->price,
                ]),
                'availability' => $available,
                'is_catering' => isset($cateringSet[$item->id]),
            ];

            $specialBlock = $baseSpecial?->toApiBlock();
            if (!$specialBlock && $activeSpecial) {
                $hasVariantDiscount = $item->has_variants
                    && collect($variants)->contains(fn (array $v) => isset($v['effective_price']));
                if ($hasVariantDiscount) {
                    $specialBlock = [
                        'id' => $activeSpecial->id,
                        'badge_label' => match (true) {
                            (bool) $activeSpecial->badge_label => $activeSpecial->badge_label === 'Special'
                                ? SpecialPricingService::DEFAULT_BADGE_LABEL
                                : $activeSpecial->badge_label,
                            default => SpecialPricingService::DEFAULT_BADGE_LABEL,
                        },
                        'discount_pct' => $activeSpecial->discount_pct,
                        'original_price' => null,
                        'effective_price' => null,
                    ];
                }
            }
            if ($specialBlock) {
                $row['special'] = $specialBlock;
            }

            return $row;
        })->values();

        // Suggestions travel with the menu, not on their own request. The till
        // caches this payload for offline service, and a "goes well with" chip
        // that needs a round trip disappears exactly when the connection does —
        // which at a counter, mid-queue, is the worst possible moment.
        // Restricted to items the cashier can actually ring up right now.
        // Channel-blocked and sold-out items still travel in the payload,
        // flagged unavailable, so filtering on presence alone is not enough —
        // a chip that cannot be tapped is worse than no chip at all.
        $pairings = $this->affinity->topPairsForItems(
            $transformed
                ->filter(fn (array $row) => ($row['availability']['available'] ?? false) === true)
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->all(),
        );

        return [
            'categories' => $categories,
            'items' => $transformed,
            'pairings' => $pairings,
        ];
    }

    /**
     * @param array<int, int> $activeGroupIds
     * @param \Illuminate\Support\Collection<int, ItemChannelAvailability> $channelRows
     * @param array<int, int> $reservedByItem
     * @return array{available: bool, reason_code: ?string, reason_message: ?string, available_stock: ?int}
     */
    private function isPosItemAvailable(
        Item $item,
        string $channel,
        array $activeGroupIds,
        $channelRows,
        array $reservedByItem,
        $at,
    ): array {
        if (!$item->is_available) {
            return [
                'available' => false,
                'reason_code' => 'item_unavailable',
                'reason_message' => 'This item is currently unavailable.',
                'available_stock' => null,
            ];
        }

        if ($item->isSnoozed($at)) {
            return [
                'available' => false,
                'reason_code' => 'snoozed',
                'reason_message' => 'Unavailable today',
                'available_stock' => null,
            ];
        }

        if ($item->menu_group_id !== null && $activeGroupIds !== []
            && !in_array((int) $item->menu_group_id, $activeGroupIds, true)) {
            return [
                'available' => false,
                'reason_code' => 'channel_unavailable',
                'reason_message' => "This item is not available for {$channel} orders right now.",
                'available_stock' => null,
            ];
        }

        $row = $channelRows->get($item->id);
        if ($row === null || !$row->is_enabled) {
            return [
                'available' => false,
                'reason_code' => 'channel_unavailable',
                'reason_message' => "This item is not available for {$channel} orders right now.",
                'available_stock' => null,
            ];
        }

        if ($row->valid_from && $at->lt($row->valid_from)) {
            return [
                'available' => false,
                'reason_code' => 'channel_unavailable',
                'reason_message' => "This item is not available for {$channel} orders right now.",
                'available_stock' => null,
            ];
        }
        if ($row->valid_until && $at->gt($row->valid_until)) {
            return [
                'available' => false,
                'reason_code' => 'channel_unavailable',
                'reason_message' => "This item is not available for {$channel} orders right now.",
                'available_stock' => null,
            ];
        }

        if ($item->track_stock && $item->availability_type === 'stock_based') {
            $reserved = $reservedByItem[$item->id] ?? 0;
            $availableStock = max(0, (int) $item->stock_quantity - $reserved);
            if ($availableStock <= 0) {
                return [
                    'available' => false,
                    'reason_code' => 'out_of_stock',
                    'reason_message' => "{$item->name} is currently sold out.",
                    'available_stock' => 0,
                ];
            }

            return [
                'available' => true,
                'reason_code' => null,
                'reason_message' => null,
                'available_stock' => $availableStock,
            ];
        }

        return [
            'available' => true,
            'reason_code' => null,
            'reason_message' => null,
            'available_stock' => null,
        ];
    }
}
