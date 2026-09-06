<?php

declare(strict_types=1);

namespace App\Domains\Menu\Services;

use App\Models\Item;

/**
 * What a fixed bundle costs, when the owner has set a bundle discount.
 *
 * Owner, 2026-09-06: "Fix all", on an audit whose first finding was that
 * `combo_discount_pct` — the "Bundle discount (%)" box in the item editor —
 * was stored, validated, returned by the API and read by no calculation
 * anywhere. Setting it to 20% changed nothing about what a customer paid.
 *
 * It now means the obvious thing: **the bundle sells for what its contents
 * come to, less that percentage**. That is the useful reading, because it
 * keeps the bundle honest as its children's prices change — put the price of
 * chicken up and the bundle follows, instead of quietly widening its own
 * discount until somebody notices.
 *
 * Leave the box empty and nothing changes: the bundle sells at its own price,
 * exactly as before. This is opt-in.
 */
final class BundlePricingService
{
    /**
     * Per-request memo. A menu listing resolves a price for every item, and a
     * bundle's children are the same rows each time.
     *
     * @var array<int, float|null>
     */
    private array $memo = [];

    /**
     * The price to charge for `$item` before specials and promotions.
     *
     * Returns `$fallback` — the item's own base or variant price — for
     * everything that is not a discounted fixed bundle, which is almost
     * everything.
     */
    public function catalogPriceFor(?Item $item, float $fallback, ?int $variantId = null): float
    {
        /*
         * A size carries its own explicit price, and a bundle sold in sizes has
         * already had that decision made for it. Only the bundle's own price is
         * computed here.
         */
        if ($variantId !== null || $item === null) {
            return $fallback;
        }

        $computed = $this->bundlePrice($item);

        return $computed ?? $fallback;
    }

    /**
     * The discounted contents price, or null when this item is not a fixed
     * bundle with a discount set.
     */
    public function bundlePrice(Item $item): ?float
    {
        $id = (int) $item->id;
        if (array_key_exists($id, $this->memo)) {
            return $this->memo[$id];
        }

        return $this->memo[$id] = $this->compute($item);
    }

    private function compute(Item $item): ?float
    {
        if (!$item->is_combo) {
            return null;
        }

        $pct = (float) ($item->combo_discount_pct ?? 0);
        if ($pct <= 0 || $pct > 100) {
            return null;
        }

        /*
         * A platter's contents are not known until somebody picks them, so
         * there is no contents price to take a percentage of. Its price stays
         * its own, and surcharges do the rest.
         */
        if ($item->isPlatter()) {
            return null;
        }

        $contents = $this->contentsPrice($item);

        // A bundle with a discount but nothing priced inside it would come to
        // zero. Fall back to its own price rather than give the food away.
        if ($contents <= 0) {
            return null;
        }

        return round($contents * (1 - $pct / 100), 2);
    }

    /**
     * What the contents come to at their own prices.
     *
     * Optional children are excluded: the customer is not guaranteed to get
     * them, so charging for them would be charging for a maybe. Each child is
     * counted at its own list price, never at whatever special it happens to
     * be running — a special on a child would otherwise discount the bundle
     * twice.
     */
    public function contentsPrice(Item $item): float
    {
        $rows = $item->relationLoaded('comboItems')
            ? $item->comboItems
            : $item->comboItems()->with('item.variants')->get();

        $total = 0.0;
        foreach ($rows as $row) {
            if ($row->is_optional) {
                continue;
            }

            $child = $row->item;
            if ($child === null || !$child->is_active) {
                continue;
            }

            $total += $this->listPriceOf($child) * max(1, (int) $row->quantity);
        }

        return $total;
    }

    /**
     * A child's own price — the cheapest size when it is sold in sizes, which
     * is the same "From" price the menu advertises it at.
     */
    private function listPriceOf(Item $child): float
    {
        if ($child->has_variants) {
            $variants = $child->relationLoaded('variants')
                ? $child->variants
                : $child->variants()->get();

            $prices = $variants
                ->filter(fn ($v) => (bool) $v->is_active)
                ->map(fn ($v) => (float) $v->price)
                ->filter(fn (float $p) => $p > 0);

            if ($prices->isNotEmpty()) {
                return (float) $prices->min();
            }
        }

        return (float) $child->base_price;
    }
}
