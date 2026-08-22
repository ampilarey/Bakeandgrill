<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domains\Promotions\Services\OffersService;
use App\Domains\System\Services\ServiceAvailabilityService;
use App\Models\Category;
use App\Models\Item;
use App\Models\ItemPhoto;
use App\Services\OpeningHoursService;
use App\Services\SpecialPricingService;
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
 */
class MenuPageController extends Controller
{
    private const NEW_ITEMS_CAP = 12;

    /** Same order as apps/online-order-web ServiceBanner.tsx. */
    private const BANNER_PRIORITY = [
        'online_ordering',
        'online_checkout',
        'online_payment',
        'online_pickup',
        'customer_registration',
    ];

    private const DEFAULT_MESSAGES = [
        'online_ordering' => 'Online ordering is temporarily unavailable.',
        'online_checkout' => 'Online ordering is temporarily unavailable — please call us or visit us.',
        'online_payment' => 'Online payment is temporarily unavailable. Cash on collection is still available.',
        'online_pickup' => 'Pickup orders are temporarily paused.',
        'customer_registration' => 'New account signups are temporarily paused.',
    ];

    /** @var list<string> */
    private const STILL_CAN = ['read the menu', 'order for tomorrow', 'call'];

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
            'menuPhotos' => $this->displayPhotos($items),
            'favouriteIds' => $this->favouriteItemIds(),
            // Menu only — the layout partial is shared, but middleware still
            // shares null on every other page. Controller data wins here.
            'serviceBanner' => $this->menuServiceBanner(),
            // Passed in rather than read from the layout: a child view's
            // sections are evaluated before the layout renders, so anything
            // the layout defines in its own @php block is not in scope here.
            'menuLocale' => $this->menuLocale(),
        ]);
    }

    /**
     * One item, as its own document. A crawler (and a phone on weak data)
     * gets the description and every size without waiting for a JS sheet.
     * Inactive or unavailable items 404 — they are not on the listing either.
     */
    public function show(int $item): View
    {
        $row = Item::query()
            ->with(['variants', 'category', 'photos'])
            ->where('is_active', true)
            ->where('is_available', true)
            ->findOrFail($item);

        $specialsByItemId = $this->indexSpecialsByItem(
            app(SpecialPricingService::class)->activeSpecialsForDisplay(),
        );

        return view('menu-item', [
            'item' => $row,
            'menuPhotos' => $this->displayPhotos(collect([$row])),
            'menuSpecialsByItemId' => $specialsByItemId,
            'favouriteIds' => $this->favouriteItemIds(),
            'serviceBanner' => $this->menuServiceBanner(),
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
     * @return array<int, array{url: ?string, webp: ?string, full: ?string}>
     */
    private function displayPhotos(Collection $items): array
    {
        $default = $this->mediaUrl(content('default_item_image'));
        $out = [];
        foreach ($items as $item) {
            $out[$item->id] = $this->displayPhotoFor($item, $default);
        }

        return $out;
    }

    /**
     * @return array{url: ?string, webp: ?string, full: ?string}
     */
    private function displayPhotoFor(Item $item, ?string $default): array
    {
        $photos = $item->photos
            ->sort(function (ItemPhoto $a, ItemPhoto $b) {
                if ((bool) $a->is_primary !== (bool) $b->is_primary) {
                    return $a->is_primary ? -1 : 1;
                }

                return $a->sort_order <=> $b->sort_order;
            })
            ->values();

        foreach ($photos as $photo) {
            if ($photo->isVideo()) {
                $url = $this->mediaUrl($photo->poster_url ?: $photo->thumb_url);
                if ($url) {
                    // A poster is the only still we have — it is both sizes.
                    return ['url' => $url, 'webp' => null, 'full' => $url];
                }

                continue;
            }

            $url = $this->mediaUrl($photo->thumb_url ?: $photo->url);
            if (!$url) {
                continue;
            }

            return [
                'url' => $url,
                'webp' => $this->mediaUrl($photo->thumb_webp_url ?: $photo->image_webp_url),
                'full' => $this->mediaUrl($photo->url) ?: $url,
            ];
        }

        $url = $this->mediaUrl($item->thumb_url ?: $item->image_url);
        if ($url) {
            return [
                'url' => $url,
                'webp' => $this->mediaUrl($item->thumb_webp_url ?: $item->image_webp_url),
                'full' => $this->mediaUrl($item->image_url) ?: $url,
            ];
        }

        return ['url' => $default, 'webp' => null, 'full' => $default];
    }

    /**
     * Same origin rewrite as Item::display_image_url, for thumbs and posters too.
     */
    private function mediaUrl(mixed $raw): ?string
    {
        $raw = trim((string) $raw);
        if ($raw === '') {
            return null;
        }
        if (!str_starts_with($raw, 'http')) {
            return url(ltrim($raw, '/'));
        }
        $path = trim(preg_replace('#^https?://[^/]+#', '', $raw), '/');

        return str_starts_with($path, 'images/cafe/') ? url($path) : $raw;
    }

    private function menuLocale(): string
    {
        return app()->bound('content.locale') ? (string) app('content.locale') : 'en';
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

    /**
     * Soft states only — marketing_site still uses the full-page 503.
     * Never call this from the shared middleware; home must stay quiet.
     *
     * @return array{service_key: string, message: string, alternatives: list<string>, retry_at: ?string, notify_enabled: bool}|null
     */
    private function menuServiceBanner(): ?array
    {
        try {
            $snapshot = app(ServiceAvailabilityService::class)->resolve();
        } catch (\Throwable) {
            $snapshot = [];
        }

        foreach (self::BANNER_PRIORITY as $key) {
            $entry = $snapshot[$key] ?? null;
            if (!is_array($entry) || ($entry['available'] ?? true)) {
                continue;
            }
            $message = trim((string) ($entry['public_message'] ?? ''));
            if ($message === '') {
                $message = self::DEFAULT_MESSAGES[$key] ?? 'This service is temporarily unavailable.';
            }
            $alts = $entry['alternatives'] ?? [];
            if (!is_array($alts) || $alts === []) {
                $alts = self::STILL_CAN;
            }

            return [
                'service_key' => $key,
                'message' => $message,
                'alternatives' => array_values(array_map('strval', $alts)),
                'retry_at' => isset($entry['ends_at']) ? (string) $entry['ends_at'] : null,
                'notify_enabled' => (bool) ($entry['notify_enabled'] ?? false),
            ];
        }

        $hours = app(OpeningHoursService::class);
        if ($hours->isOpenNow()) {
            return null;
        }

        $tz = (string) config('opening_hours.timezone');
        $reopen = $hours->getNextOpenTime();
        $when = $reopen?->timezone($tz);
        $message = $when
            ? ($when->isToday()
                ? "We're closed right now. We reopen at " . $when->format('g:i A') . '.'
                : "We're closed right now. We reopen " . $when->format('l') . ' at ' . $when->format('g:i A') . '.')
            : "We're closed right now.";

        return [
            'service_key' => 'opening_hours',
            'message' => $message,
            'alternatives' => self::STILL_CAN,
            'retry_at' => $reopen?->toIso8601String(),
            'notify_enabled' => false,
        ];
    }
}
