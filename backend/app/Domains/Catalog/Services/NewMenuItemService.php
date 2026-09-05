<?php

declare(strict_types=1);

namespace App\Domains\Catalog\Services;

use App\Models\Item;

/**
 * Which dishes count as new, decided once for every surface that says so.
 *
 * Owner, 2026-09-05: "In blade menu new items are marked. But on order app its
 * not showing." The rule lived inside MenuPageController, so the website menu
 * was the only place that could apply it; the order app's card has carried a
 * NEW badge all along with nothing ever passing it, and the API never said
 * which items were new.
 *
 * Two surfaces disagreeing about the same menu is the shape of most of what
 * went wrong this week, so the rule moves here and both read it: an item is
 * new if it was created inside the configured window (`menu_new_days`, thirty
 * days by default), and only the most recent handful are marked — "new" stops
 * meaning anything when half the menu wears the badge.
 */
class NewMenuItemService
{
    /**
     * At most this many dishes wear the badge at once, newest first.
     */
    public const CAP = 12;

    /** Days since creation, as configured in Content Hub, clamped to something sane. */
    public function windowDays(): int
    {
        return max(1, min(365, (int) content('menu_new_days', '30')));
    }

    /**
     * Ids of the items currently marked new, as a lookup.
     *
     * Deliberately its own query rather than a filter over whatever rows a
     * caller happens to be holding: the API paginates, and "the twelve newest
     * on this page" would mark different dishes on page one and page two.
     *
     * @return array<int, true>
     */
    public function newItemIds(): array
    {
        $ids = Item::query()
            ->where('is_active', true)
            ->where('is_available', true)
            ->where('created_at', '>=', now()->subDays($this->windowDays()))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(self::CAP)
            ->pluck('id')
            ->all();

        return array_fill_keys(array_map('intval', $ids), true);
    }
}
