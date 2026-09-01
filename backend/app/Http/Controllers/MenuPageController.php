<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domains\Promotions\Services\OffersService;
use App\Models\Category;
use App\Models\Item;
use App\Services\EffectivePriceService;
use App\Services\SpecialPricingService;
use App\Support\ItemDisplayPhoto;
use App\Support\PublicMediaUrl;
use App\Support\SocialPreviewImage;
use Illuminate\Contracts\View\View;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * The menu, rendered on the server.
 *
 * Replaces two things that both failed the same way. `/menu` was a 301 into
 * `/order/menu`, and the dine-in QR used to land on a React view-only route
 * — both SPAs, so a crawler asking for either received `<div id="root"></div>`
 * and the site's own `Restaurant` schema pointed at that empty page.
 *
 * SEO is the smaller half of the reason. The bigger one is the person at a
 * table: scanning a QR code used to mean downloading a large JavaScript bundle
 * before a single item appeared, indoors, often on weak mobile data. Plain
 * HTML shows immediately.
 *
 * Reading lives here; the cart and checkout stay in the SPA. Cards open
 * /menu/{id} (another server-rendered document — full description, variants,
 * tags). Add to order hands off to /order/menu?item={id}.
 *
 * **No service-availability notice here, by the owner's decision (2026-08-22).**
 * A version of this page resolved ServiceAvailabilityService and rendered the
 * shared banner partial, so /menu said "Online ordering is currently closed"
 * whenever the ordering gate was shut. It was accurate and it was removed
 * anyway: this is a menu, the ordering state belongs where someone tries to
 * order, and the notice sat on the page all day because the ordering window
 * is narrower than the opening hours. `ShareServiceAvailability` shares
 * `serviceBanner` as null for every Blade page, so nothing renders. The
 * full-page `marketing_site` maintenance view is unaffected — that is the
 * middleware's own 503 and still applies. Do not re-add this without asking.
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
            'menuPriceByItemId' => $this->effectivePrices($items),
            'menuNewItemIds' => $this->newItemIds($items, $newDays),
            'menuPhotos' => $this->displayPhotos($items),
            'menuDietaryFilters' => $this->dietaryFilters($items),
            'favouriteIds' => $this->favouriteItemIds(),
            // Passed in rather than read from the layout: a child view's
            // sections are evaluated before the layout renders, so anything
            // the layout defines in its own @php block is not in scope here.
            'menuLocale' => $this->menuLocale(),
        ]);
    }

    /**
     * One item, as its own document. A crawler (and a phone on weak data)
     * gets the description and every size without waiting for a JS sheet.
     *
     * Known items that are inactive, unavailable, or soft-deleted still
     * resolve: old social posts must not 404. A true 404 is only for an
     * id that never existed.
     */
    public function show(int $item): View
    {
        $row = Item::query()
            ->with(['variants', 'category', 'photos'])
            ->withTrashed()
            ->find($item);

        if ($row === null) {
            abort(404);
        }

        $available = !$row->trashed() && $row->is_active && $row->is_available;
        $alternatives = $available ? collect() : $this->categoryAlternatives($row);

        $priced = collect([$row])->concat($alternatives);
        $specialsByItemId = $this->indexSpecialsByItem(
            app(SpecialPricingService::class)->activeSpecialsForDisplay(),
        );

        return view('menu-item', [
            'item' => $row,
            'itemAvailable' => $available,
            'alternatives' => $alternatives,
            'menuPhotos' => $this->displayPhotos($priced),
            'menuSpecialsByItemId' => $specialsByItemId,
            'menuPriceByItemId' => $this->effectivePrices($priced),
            'menuVariantPrices' => $this->effectiveVariantPrices($row),
            'socialImage' => app(SocialPreviewImage::class)->forItem($row),
            'favouriteIds' => $this->favouriteItemIds(),
            'menuLocale' => $this->menuLocale(),
        ]);
    }

    /**
     * @return Collection<int, Item>
     */
    private function sellableItems(): Collection
    {
        return Item::query()
            ->with(['variants', 'category', 'photos'])
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
     * The price each item would actually be charged at, keyed by item id.
     *
     * Routed through EffectivePriceService because that is the resolver the
     * order pipeline itself uses (OrderCreationService calls it to set
     * unit_price), and it considers item-level auto-promotions as well as
     * daily specials, taking whichever is lower.
     *
     * Reading the daily-special rows alone — as this page used to — left an
     * item discounted by an auto-promotion advertised at full price on the one
     * menu Google indexes, while the ordering app and the till both charged
     * less. Under-stating a live discount is not a loss, but two prices for
     * one item is an argument at the counter.
     *
     * No N+1: both underlying resolvers read memoised/cached maps rather than
     * querying per item, and variants are eager-loaded by sellableItems().
     *
     * @param Collection<int, Item> $items
     * @return array<int, array{price: float, was: float|null, from: bool}>
     */
    private function effectivePrices(Collection $items): array
    {
        $pricing = app(EffectivePriceService::class);

        $out = [];
        foreach ($items as $item) {
            $out[$item->id] = $this->effectivePriceFor($item, $pricing);
        }

        return $out;
    }

    /**
     * Mirrors Item::displayPriceInfo()'s shape and its variant rules, then adds
     * `was` — the pre-discount price, or null when nothing is discounted.
     *
     * A sized item advertises "From" the cheapest variant, so the discount that
     * matters is the one on that variant: resolve every active variant and keep
     * the lowest effective price with its own original beside it. Taking the
     * cheapest variant first and discounting afterwards would show the wrong
     * "was" whenever a promotion targets only the large size.
     *
     * @return array{price: float, was: float|null, from: bool}
     */
    private function effectivePriceFor(Item $item, EffectivePriceService $pricing): array
    {
        $variants = $item->relationLoaded('variants')
            ? $item->variants->where('is_active', true)
            : collect();

        if ($item->has_variants && $variants->isNotEmpty()) {
            $bestPrice = null;
            $bestWas = null;

            foreach ($variants as $variant) {
                $resolved = $pricing->resolveUnitPrice(
                    $item->id,
                    (float) $variant->price,
                    $item,
                    $variant->id,
                );
                if ($bestPrice === null || $resolved->unitPrice < $bestPrice) {
                    $bestPrice = (float) $resolved->unitPrice;
                    $bestWas = $resolved->hasDiscount() ? (float) $resolved->originalPrice : null;
                }
            }

            return ['price' => (float) $bestPrice, 'was' => $bestWas, 'from' => true];
        }

        $resolved = $pricing->resolveUnitPrice($item->id, (float) $item->base_price, $item);

        return [
            'price' => (float) $resolved->unitPrice,
            'was' => $resolved->hasDiscount() ? (float) $resolved->originalPrice : null,
            'from' => false,
        ];
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

    /**
     * One photo per item, same selection as buildItemSlides(source: 'gallery').
     *
     * The Blade used to read thumb_url / image_url only. A photo uploaded to
     * the gallery never reached /menu, while the order app already showed it.
     *
     * `url` is the thumbnail — right for a 132px circle. `full` is the same
     * photo at full size, for JSON-LD: Google wants a large image for rich
     * results and a 400px thumb is a downgrade on what the schema used to
     * carry.
     *
     * @param Collection<int, Item> $items
     * @return array<int, array{url: ?string, webp: ?string, full: ?string, placeholder: bool}>
     */
    /**
     * @param Collection<int, Item> $items
     * @return array<int, array{url: ?string, webp: ?string, full: ?string, placeholder: bool}>
     */
    private function displayPhotos(Collection $items): array
    {
        return app(ItemDisplayPhoto::class)->forItems($items);
    }

    /**
     * @return array<int, array{price: float, was: float|null}>
     */
    private function effectiveVariantPrices(Item $item): array
    {
        $pricing = app(EffectivePriceService::class);
        $out = [];
        $variants = $item->relationLoaded('variants')
            ? $item->variants->where('is_active', true)
            : collect();

        foreach ($variants as $variant) {
            $resolved = $pricing->resolveUnitPrice(
                $item->id,
                (float) $variant->price,
                $item,
                $variant->id,
            );
            $out[$variant->id] = [
                'price' => (float) $resolved->unitPrice,
                'was' => $resolved->hasDiscount() ? (float) $resolved->originalPrice : null,
            ];
        }

        return $out;
    }

    /**
     * Sellable neighbours in the same category — the "still hungry?" strip
     * on an unavailable item's durable page.
     *
     * @return Collection<int, Item>
     */
    private function categoryAlternatives(Item $item): Collection
    {
        if (!$item->category_id) {
            return collect();
        }

        return Item::query()
            ->with(['variants', 'photos'])
            ->where('is_active', true)
            ->where('is_available', true)
            ->where('category_id', $item->category_id)
            ->where('id', '!=', $item->id)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->limit(4)
            ->get();
    }

    private function menuLocale(): string
    {
        return app()->bound('content.locale') ? (string) app('content.locale') : 'en';
    }

    /**
     * Dietary chips to offer, derived from what the items are actually tagged
     * with — never a fixed list.
     *
     * A chip for a tag nothing carries is a control that always returns
     * nothing, which is worse than no control. The order app does the same
     * thing (`MenuQuickFilters` returns null when no item qualifies), so as
     * items get tagged in Content Hub the chips appear here on their own with
     * no code change.
     *
     * Admin tags are free text, so "Gluten Free", "gluten_free" and
     * "gluten-free" must collapse to one chip. Same normalisation as
     * normalizeDietaryTag() in apps/online-order-web/src/pages/MenuPage.tsx.
     *
     * @param Collection<int, Item> $items
     * @return list<array{slug: string, label: string}>
     */
    private function dietaryFilters(Collection $items): array
    {
        $known = [
            'vegetarian' => '🥬 Vegetarian',
            'vegan' => '🌱 Vegan',
            'halal' => '☪ Halal',
            'gluten-free' => '🌾 Gluten-free',
            'spicy' => '🌶 Spicy',
        ];

        $seen = [];
        foreach ($items as $item) {
            foreach ((array) ($item->dietary_tags ?? []) as $raw) {
                $slug = self::dietarySlug((string) $raw);
                if ($slug === '' || isset($seen[$slug])) {
                    continue;
                }
                $seen[$slug] = $known[$slug] ?? ucwords(str_replace('-', ' ', $slug));
            }
        }

        ksort($seen);
        $out = [];
        foreach ($seen as $slug => $label) {
            $out[] = ['slug' => $slug, 'label' => $label];
        }

        return $out;
    }

    /** Free-text admin tag → a stable slug. */
    public static function dietarySlug(string $tag): string
    {
        $slug = strtolower(trim($tag));
        $slug = (string) preg_replace('/[_\s]+/', '-', $slug);
        $slug = (string) preg_replace('/-+/', '-', $slug);

        return trim($slug, '-');
    }

    /**
     * Favourite item ids for the signed-in customer, keyed for O(1) lookup.
     * Empty when nobody is signed in — the heart still renders, as a login link.
     *
     * @return array<int, true>
     */
    private function favouriteItemIds(): array
    {
        $customerId = Auth::guard('customer')->id();
        if (!$customerId) {
            return [];
        }

        $ids = DB::table('customer_favorites')
            ->where('customer_id', $customerId)
            ->pluck('item_id')
            ->all();

        return array_fill_keys(array_map('intval', $ids), true);
    }
}
