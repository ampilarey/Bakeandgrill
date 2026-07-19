<?php

declare(strict_types=1);

namespace App\Services;

use App\Domains\Kitchen\Services\KitchenMenuResolver;
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
    ) {}

    /**
     * @return array{categories: \Illuminate\Support\Collection, items: \Illuminate\Support\Collection<int, array<string, mixed>>}
     */
    public function build(string $channel): array
    {
        if (!in_array($channel, KitchenMenuResolver::ORDERING_CHANNELS, true)) {
            $channel = 'dine_in';
        }

        $categories = Category::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get(['id', 'name', 'name_dv', 'sort_order', 'image_url']);

        $query = Item::query()
            ->with(['category:id,name', 'variants', 'modifiers'])
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

                    $variantPricing = $this->specialPricing->resolveUnitPrice(
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
            $baseSpecial = $this->specialPricing->resolveUnitPrice(
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

        return [
            'categories' => $categories,
            'items' => $transformed,
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
