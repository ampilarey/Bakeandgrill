<?php

declare(strict_types=1);

namespace App\Domains\Menu\Services;

use App\Models\Item;
use App\Models\PlatterGroup;
use App\Models\PlatterGroupItem;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

final class PlatterCompositionService
{
    private const RULE_TYPES = ['exactly', 'min', 'range'];

    /**
     * Replace all choice groups for a platter item.
     *
     * @param  list<array<string, mixed>>  $groups
     */
    public function sync(Item $platter, array $groups): void
    {
        if (!$platter->is_combo) {
            $this->clear($platter);

            return;
        }

        if ($groups === []) {
            $this->clear($platter);

            return;
        }

        $variantLookup = $this->variantLookup($platter);
        $normalized = [];

        foreach ($groups as $index => $group) {
            $name = trim((string) ($group['name'] ?? ''));
            if ($name === '') {
                continue;
            }

            $ruleType = (string) ($group['rule_type'] ?? 'exactly');
            if (!in_array($ruleType, self::RULE_TYPES, true)) {
                throw new InvalidArgumentException("Invalid platter rule type: {$ruleType}");
            }

            $min = isset($group['min_count']) && $group['min_count'] !== null && $group['min_count'] !== ''
                ? max(0, (int) $group['min_count'])
                : null;
            $max = isset($group['max_count']) && $group['max_count'] !== null && $group['max_count'] !== ''
                ? max(0, (int) $group['max_count'])
                : null;

            if ($ruleType === 'exactly') {
                $exact = $min ?? $max;
                if ($exact === null && empty($group['size_counts'])) {
                    throw new InvalidArgumentException("Group \"{$name}\" needs a choose count (e.g. 6).");
                }
                if ($exact !== null) {
                    $min = $exact;
                    $max = $exact;
                }
            } elseif ($ruleType === 'min') {
                if ($min === null || $min < 1) {
                    throw new InvalidArgumentException("Group \"{$name}\" needs a minimum of at least 1.");
                }
                $max = null;
            } elseif ($ruleType === 'range') {
                if ($min === null || $max === null || $min < 1 || $max < $min) {
                    throw new InvalidArgumentException("Group \"{$name}\" needs a valid min and max (max ≥ min).");
                }
            }

            $allowed = [];
            foreach (($group['items'] ?? []) as $rowIndex => $row) {
                $itemId = (int) ($row['item_id'] ?? 0);
                if ($itemId <= 0 || $itemId === (int) $platter->id) {
                    continue;
                }
                $allowed[] = [
                    'item_id' => $itemId,
                    'surcharge' => max(0, (float) ($row['surcharge'] ?? 0)),
                    'sort_order' => (int) ($row['sort_order'] ?? $rowIndex),
                ];
            }

            if ($allowed === []) {
                throw new InvalidArgumentException("Group \"{$name}\" must include at least one allowed item.");
            }

            $normalized[] = [
                'name' => $name,
                'rule_type' => $ruleType,
                'min_count' => $min,
                'max_count' => $max,
                'size_counts' => $this->normalizeSizeCounts($group['size_counts'] ?? null, $variantLookup),
                'sort_order' => (int) ($group['sort_order'] ?? $index),
                'items' => $allowed,
            ];
        }

        if ($normalized === []) {
            throw new InvalidArgumentException('Platter must include at least one choice group.');
        }

        DB::transaction(function () use ($platter, $normalized): void {
            $this->clear($platter);

            foreach ($normalized as $group) {
                $items = $group['items'];
                unset($group['items']);

                $created = PlatterGroup::create([
                    'item_id' => $platter->id,
                    ...$group,
                ]);

                foreach ($items as $row) {
                    PlatterGroupItem::create([
                        'platter_group_id' => $created->id,
                        'item_id' => $row['item_id'],
                        'surcharge' => $row['surcharge'],
                        'sort_order' => $row['sort_order'],
                    ]);
                }
            }
        });
    }

    public function clear(Item $platter): void
    {
        PlatterGroup::where('item_id', $platter->id)->delete();
    }

    /** @return list<array<string, mixed>> */
    public function formatForApi(Item $platter): array
    {
        $groups = $platter->relationLoaded('platterGroups')
            ? $platter->platterGroups
            : $platter->platterGroups()->with(['allowedItems.item:id,name,name_dv,base_price,image_url,is_available,has_variants'])->get();

        return $groups->map(function (PlatterGroup $group) {
            $items = $group->relationLoaded('allowedItems')
                ? $group->allowedItems
                : $group->allowedItems()->with(['item:id,name,name_dv,base_price,image_url,is_available,has_variants'])->get();

            return [
                'id' => $group->id,
                'name' => $group->name,
                'rule_type' => $group->rule_type,
                'min_count' => $group->min_count,
                'max_count' => $group->max_count,
                'size_counts' => $this->sizeCountsForApi($group->size_counts),
                'sort_order' => $group->sort_order,
                'items' => $items->map(fn (PlatterGroupItem $row) => [
                    'item_id' => $row->item_id,
                    'surcharge' => (float) $row->surcharge,
                    'sort_order' => $row->sort_order,
                    'item' => $row->item ? [
                        'id' => $row->item->id,
                        'name' => $row->item->name,
                        'name_dv' => $row->item->name_dv,
                        'base_price' => $row->item->base_price,
                        'image_url' => $row->item->display_image_url ?? $row->item->image_url,
                        'is_available' => $row->item->is_available,
                        'has_variants' => $row->item->has_variants,
                    ] : null,
                ])->values()->all(),
            ];
        })->values()->all();
    }

    /**
     * @return array<string, int> keyed by variant id string for JSON stability
     */
    private function normalizeSizeCounts(mixed $raw, array $variantLookup): ?array
    {
        if ($raw === null || $raw === [] || $raw === '') {
            return null;
        }

        if (!is_array($raw)) {
            throw new InvalidArgumentException('size_counts must be an object of size → count.');
        }

        $out = [];
        foreach ($raw as $key => $count) {
            if ($count === null || $count === '') {
                continue;
            }
            $n = (int) $count;
            if ($n < 1) {
                continue;
            }

            $variantId = $this->resolveVariantKey((string) $key, $variantLookup);
            if ($variantId === null) {
                // Skip unknown keys on create-before-variant edge cases; ignore stale ids.
                continue;
            }
            $out[(string) $variantId] = $n;
        }

        return $out === [] ? null : $out;
    }

    /** @return array<string, int> name|id → variant id */
    private function variantLookup(Item $platter): array
    {
        $variants = $platter->relationLoaded('variants')
            ? $platter->variants
            : $platter->variants()->get(['id', 'name']);

        $lookup = [];
        foreach ($variants as $variant) {
            $lookup[(string) $variant->id] = (int) $variant->id;
            $lookup[mb_strtolower(trim((string) $variant->name))] = (int) $variant->id;
        }

        return $lookup;
    }

    private function resolveVariantKey(string $key, array $lookup): ?int
    {
        if (isset($lookup[$key])) {
            return $lookup[$key];
        }
        $lower = mb_strtolower(trim($key));
        if (isset($lookup[$lower])) {
            return $lookup[$lower];
        }

        return null;
    }

    /** @param  array<string, int>|null  $counts */
    private function sizeCountsForApi(?array $counts): ?array
    {
        if ($counts === null || $counts === []) {
            return null;
        }

        $out = [];
        foreach ($counts as $id => $n) {
            $out[(string) $id] = (int) $n;
        }

        return $out;
    }
}
