<?php

declare(strict_types=1);

namespace App\Domains\Menu\Services;

use App\Models\Item;
use App\Models\PlatterGroup;
use Illuminate\Validation\ValidationException;

/**
 * Validates customer platter picks and resolves surcharges from the definition.
 *
 * Payload children: [{ item_id, quantity, group_id? }]. Client surcharge is ignored.
 */
final class PlatterOrderService
{
    /**
     * @param  list<array<string, mixed>>  $childrenPayload
     * @return list<array{item: Item, quantity: int, surcharge: float, group_id: int}>
     */
    public function resolveChildren(Item $platter, array $childrenPayload, ?int $variantId): array
    {
        $platter->loadMissing(['platterGroups.allowedItems.item']);

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
        $allowedLookup = []; // "groupId:itemId" → surcharge
        $itemToGroups = [];
        foreach ($groups as $group) {
            foreach ($group->allowedItems as $row) {
                $allowedLookup[$group->id.':'.$row->item_id] = (float) $row->surcharge;
                $itemToGroups[$row->item_id][] = (int) $group->id;
            }
        }

        // Aggregate picks per group+item.
        $picked = []; // group_id => [item_id => qty]
        foreach ($childrenPayload as $row) {
            $itemId = (int) ($row['item_id'] ?? 0);
            $qty = (int) ($row['quantity'] ?? 0);
            if ($itemId <= 0 || $qty < 1) {
                throw ValidationException::withMessages([
                    'items' => ['Each platter choice needs an item and quantity.'],
                ]);
            }

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

            if (!isset($allowedLookup[$groupId.':'.$itemId])) {
                throw ValidationException::withMessages([
                    'items' => ['One of the chosen items is not allowed on this platter.'],
                ]);
            }

            $picked[$groupId][$itemId] = ($picked[$groupId][$itemId] ?? 0) + $qty;
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
        foreach ($picked as $items) {
            foreach (array_keys($items) as $itemId) {
                $childIds[] = (int) $itemId;
            }
        }
        $childModels = Item::query()
            ->whereIn('id', array_values(array_unique($childIds)))
            ->where('is_active', true)
            ->get()
            ->keyBy('id');

        $resolved = [];
        foreach ($picked as $groupId => $items) {
            foreach ($items as $itemId => $qty) {
                $model = $childModels->get($itemId);
                if (!$model) {
                    throw ValidationException::withMessages([
                        'items' => ["Item {$itemId} is not available."],
                    ]);
                }
                $resolved[] = [
                    'item' => $model,
                    'quantity' => (int) $qty,
                    'surcharge' => (float) $allowedLookup[$groupId.':'.$itemId],
                    'group_id' => (int) $groupId,
                ];
            }
        }

        return $resolved;
    }

    /**
     * Flatten parent + nested children item ids from an order payload.
     *
     * @param  list<array<string, mixed>>  $items
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
