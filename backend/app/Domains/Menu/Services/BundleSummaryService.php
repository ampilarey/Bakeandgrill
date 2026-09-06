<?php

declare(strict_types=1);

namespace App\Domains\Menu\Services;

use App\Models\Item;
use App\Models\PlatterGroup;

/**
 * What a bundle is, in words a customer can read.
 *
 * Owner's audit, 2026-09-06 (F7): the order app lists a fixed bundle's
 * contents and offers the platter picker, and the website menu showed a name
 * and a price. Somebody reading bakeandgrill.mv could not tell that "Mixed
 * Platter" is choose-your-own, or what is in the family bundle — the one
 * question a bundle exists to answer.
 *
 * This produces the same description for both Blade surfaces (`/menu` card and
 * `/menu/{id}`) off relations the controller has already eager-loaded. It
 * describes; it never prices an order. The price on the page still comes from
 * EffectivePriceService.
 */
final class BundleSummaryService
{
    public function __construct(
        private readonly BundlePricingService $pricing,
    ) {}

    /**
     * @param iterable<Item> $items
     * @return array<int, array<string, mixed>> keyed by item id, bundles only
     */
    public function forItems(iterable $items): array
    {
        $out = [];
        foreach ($items as $item) {
            $summary = $this->forItem($item);
            if ($summary !== null) {
                $out[(int) $item->id] = $summary;
            }
        }

        return $out;
    }

    /**
     * Null for everything that is not a bundle, which is most of the menu.
     *
     * @return array{kind: string, label: string, contents: list<array{name: string, name_dv: ?string, quantity: int, optional: bool}>, groups: list<array{name: string, pick: string, choices: list<string>}>, contents_price: float|null}|null
     */
    public function forItem(Item $item): ?array
    {
        if (!$item->is_combo) {
            return null;
        }

        if ($item->isPlatter()) {
            $groups = $this->groups($item);

            // A platter with no groups left on it is a bundle in name only —
            // nothing to choose and nothing to list, so say nothing.
            if ($groups === []) {
                return null;
            }

            return [
                'kind' => 'choice',
                'label' => 'Choose your own',
                'contents' => [],
                'groups' => $groups,
                'contents_price' => null,
            ];
        }

        $contents = $this->contents($item);
        if ($contents === []) {
            return null;
        }

        /*
         * Only worth showing when the bundle actually costs less than its
         * parts. Without a discount set the two numbers are unrelated — the
         * bundle sells at its own price — and printing "normally MVR x" beside
         * it would invent a saving nobody offered.
         */
        $contentsPrice = null;
        if ($this->pricing->bundlePrice($item) !== null) {
            $contentsPrice = round($this->pricing->contentsPrice($item), 2);
        }

        return [
            'kind' => 'fixed',
            'label' => 'Bundle',
            'contents' => $contents,
            'groups' => [],
            'contents_price' => $contentsPrice,
        ];
    }

    /**
     * @return list<array{name: string, name_dv: ?string, quantity: int, optional: bool}>
     */
    private function contents(Item $item): array
    {
        $rows = $item->relationLoaded('comboItems')
            ? $item->comboItems
            : $item->comboItems()->with(['item', 'variant'])->get();

        $out = [];
        foreach ($rows as $row) {
            $child = $row->item;
            // An inactive child is not on the menu, so listing it would promise
            // food that cannot be made.
            if ($child === null || !$child->is_active) {
                continue;
            }
            $variant = $row->variant_id
                ? ($row->relationLoaded('variant') ? $row->variant : $row->variant()->first())
                : null;

            $out[] = [
                'name' => BundleChildRules::displayName($child, $variant),
                'name_dv' => $child->name_dv ? (string) $child->name_dv : null,
                'quantity' => max(1, (int) $row->quantity),
                'optional' => (bool) $row->is_optional,
            ];
        }

        return $out;
    }

    /**
     * @return list<array{name: string, pick: string, choices: list<string>}>
     */
    private function groups(Item $item): array
    {
        $item->loadMissing('platterGroups.allowedItems.item');

        $out = [];
        foreach ($item->platterGroups as $group) {
            $choices = [];
            foreach ($group->allowedItems as $row) {
                $child = $row->item;
                if ($child === null || !$child->is_active) {
                    continue;
                }
                $variant = $row->variant_id
                    ? ($row->relationLoaded('variant') ? $row->variant : $row->variant()->first())
                    : null;
                $choices[] = BundleChildRules::displayName($child, $variant);
            }

            if ($choices === []) {
                continue;
            }

            $out[] = [
                'name' => (string) ($group->name ?: 'Choose'),
                'pick' => $this->pickLabel($group),
                'choices' => $choices,
            ];
        }

        return $out;
    }

    /**
     * Sizes are deliberately not folded in: `size_counts` gives a different
     * count per size, and the customer has not chosen a size yet on a page
     * that only reads. The picker in the order app says the exact number once
     * they have.
     */
    private function pickLabel(PlatterGroup $group): string
    {
        $min = $group->min_count;
        $max = $group->max_count;

        return match ($group->rule_type) {
            'exactly' => 'Pick ' . max(1, (int) ($min ?? $max ?? 1)),
            'min' => 'Pick ' . max(1, (int) ($min ?? 1)) . ' or more',
            default => $min !== null && $max !== null && $min !== $max
                ? "Pick {$min}–{$max}"
                : 'Pick ' . max(1, (int) ($min ?? $max ?? 1)),
        };
    }
}
