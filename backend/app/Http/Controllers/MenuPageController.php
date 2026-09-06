<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domains\Catalog\Services\NewMenuItemService;
use App\Domains\Menu\Services\BundleSummaryService;
use App\Domains\Promotions\Services\OffersService;
use App\Models\Category;
use App\Models\Item;
use App\Services\EffectivePriceService;
use App\Services\SpecialPricingService;
use App\Support\ItemDisplayPhoto;
use App\Support\QrSvg;
use App\Support\SocialPreviewImage;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

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
    /** Print layouts, in the order the toolbar offers them. */
    private const PRINT_STYLES = ['short', 'full', 'wall'];

    public function index(): View
    {
        $items = $this->sellableItems();
        $categories = $this->activeCategories();
        $groups = $this->groupByParent($items, $categories);

        $pricing = app(SpecialPricingService::class);
        $specialsByItemId = $this->indexSpecialsByItem($pricing->activeSpecialsForDisplay());
        $offers = collect(app(OffersService::class)->activeOffers());

        return view('menu', [
            'menuCategories' => $groups,
            'menuItemCount' => $items->count(),
            'menuOffers' => $offers,
            'menuSpecialsByItemId' => $specialsByItemId,
            'menuPriceByItemId' => $this->effectivePrices($items),
            'menuNewItemIds' => app(NewMenuItemService::class)->newItemIds(),
            'menuBundles' => app(BundleSummaryService::class)->forItems($items),
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
     * The menu on paper.
     *
     * Owner, 2026-09-05: "make a print option. Make different options. Short
     * version, details ect."
     *
     * Three layouts off one page, chosen by `?style=`: a dense two-column
     * price list, a full menu with descriptions and every size, and a
     * large-type sheet meant to be read from across a counter. The toolbar
     * that switches between them is `.no-print`, so what comes out of the
     * printer is the menu and nothing else.
     *
     * Deliberately different from `/menu` in one respect: this lists every
     * *active* item, including ones marked sold out today. A printed sheet
     * outlives today — dropping tonight's 86'd dish would quietly reprint the
     * menu without it, and re-listing it tomorrow means printing again.
     */
    public function print(Request $request): View
    {
        $style = (string) $request->query('style', 'short');
        if (!in_array($style, self::PRINT_STYLES, true)) {
            $style = 'short';
        }

        $items = $this->printableItems();
        $categories = $this->activeCategories();

        return view('menu-print', $this->printData($items, $categories, $style, $request->boolean('dv')));
    }

    /**
     * The same sheet as a PDF, for sending to somebody.
     *
     * Owner, 2026-09-05: "Add pdf share option." dompdf renders the same view,
     * which is why the rows are tables rather than flexbox — one template that
     * both a browser and dompdf lay out the same way, instead of a second copy
     * to keep in step.
     */
    public function printPdf(Request $request): Response
    {
        $style = (string) $request->query('style', 'short');
        if (!in_array($style, self::PRINT_STYLES, true)) {
            $style = 'short';
        }

        $items = $this->printableItems();
        $data = $this->printData($items, $this->activeCategories(), $style, $request->boolean('dv'));
        $data['forPdf'] = true;

        return Pdf::loadView('menu-print', $data)
            ->setPaper('a4')
            ->download($data['pdfFilename']);
    }

    /**
     * Everything both the screen sheet and the PDF need, built once.
     *
     * @param Collection<int, Item> $items
     * @param Collection<int, Category> $categories
     * @return array<string, mixed>
     */
    private function printData(Collection $items, Collection $categories, string $style, bool $showDhivehi): array
    {
        $brand = trim((string) (content('site_name', '') ?: config('app.name', 'Bake & Grill')));

        return [
            'printStyle' => $style,
            'printStyles' => self::PRINT_STYLES,
            'showDhivehi' => $showDhivehi,
            'forPdf' => false,
            'brand' => $brand,
            'brandLogo' => $this->brandLogoDataUri(),
            'brandTagline' => trim((string) content('site_tagline', '')),
            'brandAddress' => trim((string) content('business_address', '')),
            'brandPhone' => trim((string) content('business_phone', '')),
            // Scan the sheet, open the live menu. The printed prices are a
            // snapshot; this is the copy that is never out of date.
            'menuQr' => QrSvg::dataUri(route('menu'), 180),
            'menuUrl' => preg_replace('#^https?://#', '', route('menu')),
            // Named here so the page's share sheet and the download agree on
            // what the file is called.
            'pdfFilename' => sprintf(
                '%s-menu-%s.pdf',
                Str::slug($brand) ?: 'menu',
                now()->format('Y-m-d'),
            ),
            'menuCategories' => $this->groupByParent($items, $categories),
            'menuItemCount' => $items->count(),
            'menuPriceByItemId' => $this->effectivePrices($items),
            'menuVariantPricesByItemId' => $this->variantPrices($items),
            'menuLocale' => $this->menuLocale(),
            'printedAt' => now(),
        ];
    }

    /**
     * @return Collection<int, Item>
     */
    private function printableItems(): Collection
    {
        return Item::query()
            ->with(['variants', 'category', 'extraCategories'])
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();
    }

    /**
     * The logo as a `data:` URI, or null when there is not one to be had.
     *
     * Read off disk rather than fetched: dompdf would otherwise have to make an
     * HTTP request to our own site to build a PDF, which fails quietly behind a
     * firewall and turns a menu into a broken image box. A remote logo URL is
     * simply not embedded — the sheet keeps its wordmark and prints fine.
     */
    private function brandLogoDataUri(): ?string
    {
        $raw = trim((string) content('logo', '')) ?: '/logo.png';
        $path = parse_url($raw, PHP_URL_PATH) ?: $raw;
        $file = public_path(ltrim((string) $path, '/'));

        if (!is_file($file) || !is_readable($file)) {
            return null;
        }

        // A masthead logo is small; anything this large is a mistake upstream
        // and would bloat every PDF we hand out.
        if (filesize($file) > 2 * 1024 * 1024) {
            return null;
        }

        $mime = match (strtolower(pathinfo($file, PATHINFO_EXTENSION))) {
            'png' => 'image/png',
            'jpg', 'jpeg' => 'image/jpeg',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'svg' => 'image/svg+xml',
            default => null,
        };

        if ($mime === null) {
            return null;
        }

        return 'data:' . $mime . ';base64,' . base64_encode((string) file_get_contents($file));
    }

    /**
     * Every size, named, with its own effective price.
     *
     * `effectivePriceFor` answers "from" — the cheapest size — which is right
     * for a card on a phone and useless on a price list, where somebody has to
     * read off what a Large costs. The money itself comes from
     * `effectiveVariantPrices`, the same helper the single-item page uses, so
     * a discounted size cannot print at one price here and another there.
     *
     * @param Collection<int, Item> $items
     * @return array<int, list<array{name: string, price: float, was: ?float}>>
     */
    private function variantPrices(Collection $items): array
    {
        $out = [];

        foreach ($items as $item) {
            if (!$item->has_variants || !$item->relationLoaded('variants')) {
                continue;
            }

            $priced = $this->effectiveVariantPrices($item);

            $rows = [];
            foreach ($item->variants->where('is_active', true)->sortBy('sort_order') as $variant) {
                if (!isset($priced[$variant->id])) {
                    continue;
                }
                $rows[] = ['name' => (string) $variant->name] + $priced[$variant->id];
            }

            if ($rows !== []) {
                $out[$item->id] = $rows;
            }
        }

        return $out;
    }

    /**
     * One item, as its own document. A crawler (and a phone on weak data)
     * gets the description and every size without waiting for a JS sheet.
     *
     * Known items that are inactive, unavailable, or soft-deleted still
     * resolve: old social posts must not 404. A true 404 is only for an
     * id that never existed.
     */
    public function show(int $item, Request $request): View
    {
        $row = Item::query()
            ->with([
                'variants', 'category', 'photos',
                'comboItems.item:id,name,name_dv,is_active,base_price,has_variants',
                'comboItems.item.variants',
                'platterGroups.allowedItems.item:id,name,is_active',
            ])
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

        // The menu grid opens an item in a sheet, so it asks for the body on
        // its own. Gated on the header rather than a query string: a fragment
        // has no <head>, no canonical and no structured data, so it must not
        // be something a crawler or a shared link can land on. Anything that
        // arrives without the header — a person, a bot, a pasted URL — gets
        // the whole page exactly as before.
        $isSheet = $request->header('X-Menu-Sheet') === '1';

        return view('menu-item', [
            'menuItemLayout' => $isSheet ? 'layouts.fragment' : 'layout',
            'item' => $row,
            'itemAvailable' => $available,
            'alternatives' => $alternatives,
            'menuPhotos' => $this->displayPhotos($priced),
            'menuSpecialsByItemId' => $specialsByItemId,
            'menuPriceByItemId' => $this->effectivePrices($priced),
            'menuVariantPrices' => $this->effectiveVariantPrices($row),
            'menuBundle' => app(BundleSummaryService::class)->forItem($row),
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
            // The bundle relations are what tells a reader that "Mixed Platter"
            // is choose-your-own (owner's audit, 2026-09-06, F7). Eager-loaded
            // rather than resolved per card, which would be an N+1 across the
            // whole menu.
            ->with([
                'variants', 'category', 'photos', 'extraCategories',
                'comboItems.item:id,name,name_dv,is_active,base_price,has_variants',
                'comboItems.item.variants',
                'platterGroups.allowedItems.item:id,name,is_active',
            ])
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

        // An item is listed under its home category and under every "also
        // show in" category (owner, 2026-09-03: Bajiya under Kulhi Hedhikaa
        // and under Evening Tea). Same card in each place; the home still
        // owns its sort order and everything else.
        $inCategory = fn (Item $item, int $categoryId): bool => (int) $item->category_id === $categoryId
            || in_array($categoryId, $item->extraCategoryIds(), true);

        foreach ($parents as $parent) {
            $direct = $items->filter(fn (Item $item) => $inCategory($item, (int) $parent->id))->values();
            $subs = $categories
                ->filter(fn (Category $category) => (int) $category->parent_id === (int) $parent->id)
                ->map(function (Category $sub) use ($items, $inCategory) {
                    $subItems = $items->filter(fn (Item $item) => $inCategory($item, (int) $sub->id))->values();

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
