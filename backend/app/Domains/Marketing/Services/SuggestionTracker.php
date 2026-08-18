<?php

declare(strict_types=1);

namespace App\Domains\Marketing\Services;

use App\Models\Item;
use App\Models\ItemSuggestionStat;
use Illuminate\Database\QueryException;

/**
 * Records whether a recommendation was seen and whether it was taken.
 *
 * Without this the upsell panel can only be admired, not evaluated: there is no
 * way to tell a suggestion that earns its place from one customers have learned
 * to scroll past, and no way to tell whether a scoring change helped.
 */
final class SuggestionTracker
{
    public const SURFACES = ['cart', 'item_sheet', 'pos'];

    public const ACTIONS = ['shown', 'accepted'];

    /**
     * Fold a batch of events into the daily tallies.
     *
     * @param  list<int>  $itemIds  the suggested items, not the anchor
     * @return int number of item rows touched
     */
    public function record(string $surface, string $action, array $itemIds): int
    {
        if (!in_array($surface, self::SURFACES, true) || !in_array($action, self::ACTIONS, true)) {
            return 0;
        }

        // A surface may legitimately show the same item twice in one payload
        // (two anchors, one winner); count it once per report, not once per row.
        $ids = array_values(array_unique(array_filter(array_map('intval', $itemIds))));
        if ($ids === []) {
            return 0;
        }

        // Only real, still-present items — a stale client can post an id that
        // has since been deleted, and the FK would reject the whole batch.
        $prices = Item::query()->whereIn('id', $ids)->pluck('base_price', 'id');
        if ($prices->isEmpty()) {
            return 0;
        }

        $today = now()->toDateString();
        $accepted = $action === 'accepted';

        foreach ($prices as $itemId => $price) {
            // Price is captured now because the nightly recompute cannot
            // reconstruct what an item cost on the day it was suggested.
            $revenue = $accepted ? round((float) $price, 2) : 0.0;

            $key = [
                'stat_date' => $today,
                'surface' => $surface,
                'item_id' => (int) $itemId,
            ];

            // firstOrCreate can lose a race against another till on the same
            // day/surface/item; the unique index turns that into a duplicate-key
            // error rather than a double count, and the row it lost to is the
            // one we want anyway.
            try {
                ItemSuggestionStat::query()->firstOrCreate($key, [
                    'shown_count' => 0,
                    'accepted_count' => 0,
                    'accepted_revenue' => 0,
                ]);
            } catch (QueryException) {
                // Someone else created it a moment ago — fall through and add to it.
            }

            // incrementEach emits `col = col + n` with unqualified names, which
            // is both atomic and portable across MySQL, PostgreSQL and the
            // SQLite used by the test suite.
            ItemSuggestionStat::query()->where($key)->incrementEach([
                'shown_count' => $accepted ? 0 : 1,
                'accepted_count' => $accepted ? 1 : 0,
                'accepted_revenue' => $revenue,
            ]);
        }

        return $prices->count();
    }
}
