<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Item;
use App\Models\PosQuickKey;
use Illuminate\Support\Facades\DB;

/**
 * The Quick tab on the till: a shared set of pinned items, and a personal
 * set per cashier that replaces it for them.
 *
 * Both are lists of item ids in order. They travel inside the menu payload,
 * which the till caches, so the tab is there offline too. Saving replaces the
 * whole list — the till holds the list and sends it back after every change,
 * which is simpler than a diff and cannot drift.
 */
class PosQuickKeyService
{
    public const MAX_KEYS = 24;

    /**
     * @return array{shared: list<int>, mine: list<int>}
     */
    public function forUser(?int $userId): array
    {
        $rows = PosQuickKey::query()
            ->when(
                $userId === null,
                fn ($q) => $q->whereNull('user_id'),
                fn ($q) => $q->where(fn ($w) => $w->whereNull('user_id')->orWhere('user_id', $userId)),
            )
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get(['user_id', 'item_id']);

        return [
            'shared' => $rows->whereNull('user_id')->pluck('item_id')->map('intval')->values()->all(),
            'mine' => $rows->whereNotNull('user_id')->pluck('item_id')->map('intval')->values()->all(),
        ];
    }

    /**
     * Replace a set. Unknown, deleted and duplicate ids are dropped rather than
     * rejected: a till saving a list it built from a cached menu should not
     * fail because one item was retired in the meantime.
     *
     * @param list<int> $itemIds
     * @return list<int> what was stored, in order
     */
    public function replace(?int $userId, array $itemIds): array
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $itemIds), fn (int $id) => $id > 0)));
        $ids = array_slice($ids, 0, self::MAX_KEYS);

        $known = Item::query()->whereIn('id', $ids)->pluck('id')->map('intval')->all();
        $knownSet = array_flip($known);
        $ids = array_values(array_filter($ids, fn (int $id) => isset($knownSet[$id])));

        DB::transaction(function () use ($userId, $ids): void {
            PosQuickKey::query()
                ->when($userId === null, fn ($q) => $q->whereNull('user_id'), fn ($q) => $q->where('user_id', $userId))
                ->delete();

            foreach ($ids as $index => $itemId) {
                PosQuickKey::query()->create([
                    'user_id' => $userId,
                    'item_id' => $itemId,
                    'sort_order' => $index,
                ]);
            }
        });

        return $ids;
    }
}
