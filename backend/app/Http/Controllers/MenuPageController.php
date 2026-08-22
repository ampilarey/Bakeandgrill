<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domains\Promotions\Services\OffersService;
use App\Models\Category;
use App\Models\Item;
use App\Services\SpecialPricingService;
use Illuminate\Contracts\View\View;
use Illuminate\Support\Collection;

/**
 * The menu, rendered on the server.
 *
 * Replaces two things that both failed the same way. `/menu` was a 301 into
 * `/order/menu`, and the dine-in QR code pointed at `/order/view` — both React
 * routes, so a crawler asking for either received `<div id="root"></div>` and
 * the site's own `Restaurant` schema pointed at that empty page.
 *
 * SEO is the smaller half of the reason. The bigger one is the person at a
 * table: scanning a QR code used to mean downloading a large JavaScript bundle
 * before a single item appeared, indoors, often on weak mobile data. Plain
 * HTML shows immediately.
 *
 * Reading lives here; the cart and checkout stay in the SPA. Each item links
 * to /order/menu?item={id}, which is the handoff.
 */
class MenuPageController extends Controller
{
    private const NEW_ITEMS_CAP = 12;

    public function index(): View
    {
        $items = $this->sellableItems();
        $categories = $this->activeCategories();
        $groups = $this->groupByParent($items, $categories);

        $pricing = app(SpecialPricingService::class);
        $specialsByItemId = $this->indexSpecialsByItem($pricing->activeSpecialsForDisplay());
        $offers = collect(app(OffersService::class)->activeOffers());

        $newDays = max(1, min(365, (int) content('menu_new_days', '30')));

        return view('menu', [
            'menuCategories' => $groups,
            'menuItemCount' => $items->count(),
            'menuOffers' => $offers,
            'menuSpecialsByItemId' => $specialsByItemId,
            'menuNewItemIds' => $this->newItemIds($items, $newDays),
            // Passed in rather than read from the layout: a child view's
            // sections are evaluated before the layout renders, so anything
            // the layout defines in its own @php block is not in scope here.
            'menuLocale' => app()->bound('content.locale') ? (string) app('content.locale') : 'en',
        ]);
    }

    /**
     * @return Collection<int, Item>
     */
    private function sellableItems(): Collection
    {
        return Item::query()
            ->with(['variants', 'category'])
            ->where('is_active', true)
            ->where('is_available', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();
    }

    /**
     * @return Collection<int, Category>
     */
    private function activeCategories(): Collection
    {
        return Category::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get()
            ->keyBy('id');
    }

    /**
     * Parent category sections, with subcategory blocks inside them.
     *
     * Mirrors MenuViewPage: the rail lists parents only. A subcategory that
     * used to render as its own top-level section now sits under its parent.
     *
     * @param Collection<int, Item> $items
     * @param Collection<int, Category> $categories
     * @return Collection<int, array{category: ?Category, items: Collection<int, Item>, subcategories: list<array{category: Category, items: Collection<int, Item>}>}>
     */
    private function groupByParent(Collection $items, Collection $categories): Collection
    {
        if ($items->isEmpty()) {
            return collect();
        }

        $used = [];
        $ordered = collect();

        $parents = $categories->filter(fn (Category $category) => $category->parent_id === null);

        foreach ($parents as $parent) {
            $direct = $items->where('category_id', $parent->id)->values();
            $subs = $categories
                ->filter(fn (Category $category) => (int) $category->parent_id === (int) $parent->id)
                ->map(function (Category $sub) use ($items) {
                    $subItems = $items->where('category_id', $sub->id)->values();

                    return $subItems->isEmpty() ? null : [
                        'category' => $sub,
                        'items' => $subItems,
                    ];
                })
                ->filter()
                ->values()
                ->all();

            foreach ($direct as $item) {
                $used[$item->id] = true;
            }
            foreach ($subs as $block) {
                foreach ($block['items'] as $item) {
                    $used[$item->id] = true;
                }
            }

            if ($direct->isEmpty() && $subs === []) {
                continue;
            }

            $ordered->push([
                'category' => $parent,
                'items' => $direct,
                'subcategories' => $subs,
            ]);
        }

        $leftover = $items->reject(fn (Item $item) => isset($used[$item->id]))->values();
        if ($leftover->isNotEmpty()) {
            $ordered->push([
                'category' => null,
                'items' => $leftover,
                'subcategories' => [],
            ]);
        }

        return $ordered;
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return array<int, list<array<string, mixed>>>
     */
    private function indexSpecialsByItem(array $rows): array
    {
        $byItem = [];
        foreach ($rows as $row) {
            $itemId = (int) ($row['item_id'] ?? 0);
            if ($itemId < 1) {
                continue;
            }
            $byItem[$itemId][] = $row;
        }

        return $byItem;
    }

    /**
     * @param Collection<int, Item> $items
     * @return array<int, true>
     */
    private function newItemIds(Collection $items, int $newDays): array
    {
        $cutoff = now()->subDays($newDays);
        $ids = $items
            ->filter(fn (Item $item) => $item->created_at !== null && $item->created_at->gte($cutoff))
            ->sortByDesc(fn (Item $item) => $item->created_at?->timestamp ?? 0)
            ->take(self::NEW_ITEMS_CAP)
            ->pluck('id')
            ->all();

        return array_fill_keys($ids, true);
    }
}
