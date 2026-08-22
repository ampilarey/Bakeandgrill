<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\Item;
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
    public function index(): View
    {
        $categories = $this->categoriesWithItems();

        return view('menu', [
            'menuCategories' => $categories,
            'menuItemCount' => $categories->sum(fn (array $group) => count($group['items'])),
            // Passed in rather than read from the layout: a child view's
            // sections are evaluated before the layout renders, so anything
            // the layout defines in its own @php block is not in scope here.
            'menuLocale' => app()->bound('content.locale') ? (string) app('content.locale') : 'en',
        ]);
    }

    /**
     * Categories in menu order, each with the items a customer can actually
     * order right now.
     *
     * Items whose category was deleted or deactivated are gathered under a
     * final unnamed group rather than dropped — an item nobody can find is
     * indistinguishable from an item that does not exist, and silently hiding
     * stock from the menu is the worse failure.
     *
     * @return Collection<int, array{category: ?Category, items: Collection<int, Item>}>
     */
    private function categoriesWithItems(): Collection
    {
        $items = Item::query()
            ->with(['variants', 'category'])
            ->where('is_active', true)
            ->where('is_available', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        if ($items->isEmpty()) {
            return collect();
        }

        $categories = Category::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get()
            ->keyBy('id');

        $grouped = $items->groupBy(fn (Item $item) => $categories->has((int) $item->category_id)
            ? (int) $item->category_id
            : 0);

        $ordered = $categories
            ->filter(fn (Category $category) => $grouped->has((int) $category->id))
            ->map(fn (Category $category) => [
                'category' => $category,
                'items' => $grouped->get((int) $category->id, collect()),
            ])
            ->values();

        if ($grouped->has(0)) {
            $ordered->push(['category' => null, 'items' => $grouped->get(0)]);
        }

        return $ordered;
    }
}
