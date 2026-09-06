<?php

declare(strict_types=1);

namespace App\Domains\Menu\Services;

use App\Models\Item;
use App\Models\PlatterGroup;
use App\Models\Variant;
use Illuminate\Validation\ValidationException;

/**
 * Validates customer platter picks and resolves surcharges from the definition.
 *
 * Payload children: [{ item_id, quantity, group_id? }]. Client surcharge is ignored.
 */
final class PlatterOrderService
{
    /**
     * Payload children: [{ item_id, quantity, group_id?, variant_id? }]. A pick
     * names a size only when the definition offers that item in more than
     * one size; otherwise the size on the definition is used.
     *
     * @param list<array<string, mixed>> $childrenPayload
     * @return list<array{item: Item, variant: ?Variant, quantity: int, surcharge: float, group_id: int}>
     */
    public function resolveChildren(Item $platter, array $childrenPayload, ?int $variantId): array
    {
        $platter->loadMissing(['platterGroups.allowedItems.item', 'platterGroups.allowedItems.variant']);

        if (!$platter->isPlatter()) {
            if ($childrenPayload !== []) {
                throw ValidationException::withMessages([
                    'items' => ["\"{$platter->name}\" is not a build-your-own platter."],
                ]);
            }

            return [];
        }

        if ($childrenPayload === []) {
            throw ValidationException::withMessages([
                'items' => ["Choose items for \"{$platter->name}\" before ordering."],
            ]);
        }

        /** @var \Illuminate\Support\Collection<int, PlatterGroup> $groups */
        $groups = $platter->platterGroups;
        $allowedLookup = []; // "groupId:itemId:variantId" → surcharge
        $sizesOffered = []; // "groupId:itemId" → list<int variant id or 0>
        $itemToGroups = [];
        foreach ($groups as $group) {
            foreach ($group->allowedItems as $row) {
                $vid = (int) ($row->variant_id ?? 0);
                $allowedLookup[$group->id . ':' . $row->item_id . ':' . $vid] = (float) $row->surcharge;
                $sizesOffered[$group->id . ':' . $row->item_id][] = $vid;
                if (!in_array((int) $group->id, $itemToGroups[$row->item_id] ?? [], true)) {
                    $itemToGroups[$row->item_id][] = (int) $group->id;
                }
            }
        }

        // Aggregate picks per group+item+size.
        $picked = []; // group_id => ["itemId:variantId" => qty]
        foreach ($childrenPayload as $row) {
            $itemId = (int) ($row['item_id'] ?? 0);
            $qty = (int) ($row['quantity'] ?? 0);
            if ($itemId <= 0 || $qty < 1) {
                throw ValidationException::withMessages([
                    'items' => ['Each platter choice needs an item and quantity.'],
                ]);
            }
            $pickVariantId = isset($row['variant_id']) && $row['variant_id'] !== null ? (int) $row['variant_id'] : null;

            $groupId = isset($row['group_id']) ? (int) $row['group_id'] : 0;
            if ($groupId <= 0) {
                $candidates = $itemToGroups[$itemId] ?? [];
                if (count($candidates) === 1) {
                    $groupId = $candidates[0];
                } elseif (count($candidates) === 0) {
                    throw ValidationException::withMessages([
                        'items' => ['One of the chosen items is not allowed on this platter.'],
                    ]);
                } else {
                    throw ValidationException::withMessages([
                        'items' => ['Specify which platter group each choice belongs to.'],
                    ]);
                }
            }

            $offered = $sizesOffered[$groupId . ':' . $itemId] ?? [];
            if ($offered === []) {
                throw ValidationException::withMessages([
                    'items' => ['One of the chosen items is not allowed on this platter.'],
                ]);
            }
            // The size comes from the definition unless the definition
            // offers this item in several sizes — then the pick has to say.
            if ($pickVariantId === null) {
                if (count($offered) > 1) {
                    throw ValidationException::withMessages([
                        'items' => ['Say which size you want for one of the platter choices.'],
                    ]);
                }
                $pickVariantId = $offered[0];
            } elseif (!in_array($pickVariantId, $offered, true)) {
                throw ValidationException::withMessages([
                    'items' => ['That size is not offered on this platter.'],
                ]);
            }

            $key = $itemId . ':' . $pickVariantId;
            $picked[$groupId][$key] = ($picked[$groupId][$key] ?? 0) + $qty;
        }

        foreach ($groups as $group) {
            $counts = $this->resolveCounts($group, $variantId);
            $have = array_sum($picked[$group->id] ?? []);
            if ($counts['min'] !== null && $have < $counts['min']) {
                throw ValidationException::withMessages([
                    'items' => ["\"{$group->name}\" needs {$counts['min']} picks (you chose {$have})."],
                ]);
            }
            if ($counts['max'] !== null && $have > $counts['max']) {
                throw ValidationException::withMessages([
                    'items' => ["\"{$group->name}\" allows at most {$counts['max']} picks (you chose {$have})."],
                ]);
            }
        }

        // Reject picks for unknown groups.
        foreach (array_keys($picked) as $groupId) {
            if (!$groups->contains(fn (PlatterGroup $g) => (int) $g->id === (int) $groupId)) {
                throw ValidationException::withMessages([
                    'items' => ['Invalid platter group on this order.'],
                ]);
            }
        }

        $childIds = [];
        $variantIds = [];
        foreach ($picked as $items) {
            foreach (array_keys($items) as $key) {
                [$itemId, $vid] = array_map('intval', explode(':', (string) $key));
                $childIds[] = $itemId;
                if ($vid > 0) {
                    $variantIds[] = $vid;
                }
            }
        }
        $childModels = Item::query()
            ->whereIn('id', array_values(array_unique($childIds)))
            ->where('is_active', true)
            ->get()
            ->keyBy('id');
        $variantModels = $variantIds === []
            ? collect()
            : Variant::query()->whereIn('id', array_values(array_unique($variantIds)))->get()->keyBy('id');

        $resolved = [];
        foreach ($picked as $groupId => $items) {
            foreach ($items as $key => $qty) {
                [$itemId, $vid] = array_map('intval', explode(':', (string) $key));
                $model = $childModels->get($itemId);
                if (!$model) {
                    throw ValidationException::withMessages([
                        'items' => ["Item {$itemId} is not available."],
                    ]);
                }
                $variant = $vid > 0 ? $variantModels->get($vid) : null;
                if ($vid > 0 && (!$variant || (int) $variant->item_id !== (int) $model->id)) {
                    throw ValidationException::withMessages([
                        'items' => ["That size of \"{$model->name}\" is no longer available."],
                    ]);
                }
                $resolved[] = [
                    'item' => $model,
                    'variant' => $variant,
                    'quantity' => (int) $qty,
                    'surcharge' => (float) $allowedLookup[$groupId . ':' . $itemId . ':' . $vid],
                    'group_id' => (int) $groupId,
                ];
            }
        }

        return $resolved;
    }

    /**
     * Flatten parent + nested children item ids from an order payload.
     *
     * @param list<array<string, mixed>> $items
     * @return list<int>
     */
    public function collectItemIdsFromPayload(array $items): array
    {
        $ids = [];
        foreach ($items as $row) {
            $ids[] = (int) ($row['item_id'] ?? 0);
            foreach (($row['children'] ?? []) as $child) {
                $ids[] = (int) ($child['item_id'] ?? 0);
            }
        }

        return array_values(array_unique(array_filter($ids)));
    }

    /** @return array{min: int|null, max: int|null} */
    private function resolveCounts(PlatterGroup $group, ?int $variantId): array
    {
        $sizeCounts = $group->size_counts;
        if (is_array($sizeCounts) && $variantId !== null) {
            $keyed = $sizeCounts[(string) $variantId] ?? null;
            if ($keyed !== null && (int) $keyed > 0) {
                $n = (int) $keyed;

                return ['min' => $n, 'max' => $n];
            }
        }

        return match ($group->rule_type) {
            'exactly' => [
                'min' => $group->min_count ?? $group->max_count,
                'max' => $group->min_count ?? $group->max_count,
            ],
            'min' => [
                'min' => $group->min_count ?? 1,
                'max' => null,
            ],
            default => [
                'min' => $group->min_count,
                'max' => $group->max_count,
            ],
        };
    }
}
