<?php

declare(strict_types=1);

namespace App\Domains\Menu\Support;

use App\Domains\Reporting\Support\ReportMoneySql;
use App\Models\Item;
use App\Models\Variant;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The website home's Best Sellers, one card per product (owner, 2026-10-26:
 * "cant u show variants in best selers?"). A size is its own product, as in
 * every report: Nescafé Milk and Nescafé Black rank apart, each card naming
 * its size and showing that size's price, never "From". An item sold with no
 * size (or before it had sizes) keeps one card with the "From" price.
 *
 * Each card is an Item (a clone per size) carrying `order_items_count`, the
 * lines sold in the last 30 days, and the relation `bestVariant` (null for a
 * plain item). Items kept out of the best sellers never show.
 */
final class BestSellerCards
{
    /** @return Collection<int, Item> */
    public static function top(int $limit = 6, int $days = 30): Collection
    {
        // A few more rows than shown: a row whose item or size is off the menu is skipped.
        $rows = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereNull('order_items.deleted_at')
            ->where('orders.created_at', '>=', now()->subDays($days))
            ->where(ReportMoneySql::sale('orders.'))
            ->whereNotNull('order_items.item_id')
            ->groupBy('order_items.item_id', 'order_items.variant_id')
            ->selectRaw('order_items.item_id, order_items.variant_id, COUNT(*) as lines_sold')
            ->orderByDesc('lines_sold')
            ->orderBy('order_items.item_id')
            ->limit($limit * 4)
            ->get();

        if ($rows->isEmpty()) {
            return collect();
        }

        $items = Item::query()
            ->whereIn('id', $rows->pluck('item_id')->unique())
            ->where('is_active', true)
            ->where('is_available', true)
            ->where('hide_from_bestsellers', false)
            ->with(['category', 'variants'])
            ->get()
            ->keyBy('id');

        $cards = collect();
        foreach ($rows as $row) {
            $item = $items->get((int) $row->item_id);
            if ($item === null) {
                continue;
            }

            $variant = null;
            if ($row->variant_id !== null) {
                /** @var Variant|null $variant */
                $variant = $item->variants->firstWhere('id', (int) $row->variant_id);
                if ($variant === null || ! $variant->is_active) {
                    continue;
                }
            }

            $card = clone $item;
            $card->setAttribute('order_items_count', (int) $row->lines_sold);
            $card->setRelation('bestVariant', $variant);
            $cards->push($card);

            if ($cards->count() >= $limit) {
                break;
            }
        }

        return $cards;
    }

    /** The price a card shows: the size's own, else the item's display price. */
    public static function price(Item $card): array
    {
        $variant = $card->relationLoaded('bestVariant') ? $card->getRelation('bestVariant') : null;

        return $variant !== null
            ? ['price' => (float) $variant->price, 'from' => false]
            : $card->displayPriceInfo();
    }
}
