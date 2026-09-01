@extends('layout')

@section('title', 'Menu – Bake & Grill')
@section('description', 'The full Bake &amp; Grill menu — Dhivehi hedhikaa, fast food, sweet treats and drinks, freshly made in Malé. Prices in MVR.')

@section('styles')
<style>
/* Server-rendered so a crawler — and a phone on weak data at a table — get
   the food before any JavaScript runs. The category rail below enhances it;
   nothing here depends on the rail working.

   The layout deliberately mirrors the order app's menu (apps/online-order-web,
   `cat-rail` + `menu-card-article--zus`): a sticky rail of category thumbnails
   down the left, an image band per section, and borderless cards with round
   photos. Someone who scans the QR code here and then taps through to order
   should not feel they have changed products halfway. */

:root {
    --menu-rail-w: 92px;
    --menu-circle: min(132px, 34vw);
    --menu-sticky: 76px; /* matches html { scroll-padding-top } in the layout */
}

/* Reachable by screen reader and by search engines, drawn nowhere. Not
   display:none, which would take it out of the accessibility tree too. */
.visually-hidden {
    position: absolute;
    width: 1px; height: 1px;
    margin: -1px; padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
}

/* ── Shell: sticky rail + sections ──────────────────────────────────── */
.menu-shell {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    max-width: 1180px;
    margin: 0 auto;
    /* Small top pad: the hero used to provide this gap. Without it the first
       category band butts straight against the header. */
    padding: 0.75rem 1.25rem 4rem;
}

/* Plain anchor links, so the rail works before JS and keeps working without
   it. The scroll-spy at the bottom of the page only adds the active mark. */
.menu-rail {
    flex: 0 0 var(--menu-rail-w);
    width: var(--menu-rail-w);
    position: sticky;
    top: var(--menu-sticky);
    align-self: flex-start;
    max-height: calc(100dvh - var(--menu-sticky) - 1rem);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.5rem 0;
    border-right: 1px solid var(--border);
}
.menu-rail-list { display: flex; flex-direction: column; gap: 2px; }
.menu-rail a {
    display: flex; flex-direction: column; align-items: center;
    gap: 4px;
    padding: 0.5rem 0.35rem;
    border-left: 3px solid transparent;
    color: var(--muted);
    text-decoration: none;
    text-align: center;
}
.menu-rail a:hover { color: var(--amber); }
.menu-rail a.is-active {
    background: var(--amber-light);
    border-left-color: var(--amber);
    color: var(--amber);
}
.menu-rail-thumb {
    width: 40px; height: 40px;
    border-radius: 10px;
    object-fit: cover;
    flex-shrink: 0;
}
/* Letter fallback only — an <img> is a replaced element and ignores this. */
span.menu-rail-thumb {
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 0.9rem;
    color: #1C1408;
}
.menu-rail-label {
    font-size: 0.625rem; font-weight: 600; line-height: 1.15;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; word-break: break-word; max-width: 100%;
}
.menu-rail-count { font-size: 10px; opacity: 0.7; }
.menu-rail a.menu-rail-events {
    margin-top: 6px;
    border-top: 1px solid var(--border);
    font-weight: 700;
}

.menu-main { flex: 1; min-width: 0; }

/* ── Filter bar ─────────────────────────────────────────────────────── */
/* Hidden until JS is confirmed — see html.js in the layout. A search box
   that cannot search is worse than none. */
.menu-filters { display: none; }
html.js .menu-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    position: sticky;
    top: var(--menu-sticky);
    z-index: 5;
    padding: 0.6rem 0;
    background: var(--bg);
}
/* Toolbar row: search button + Grid/List, as in the order app. */
.menu-tools {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
}
.menu-tool {
    display: inline-flex; align-items: center; gap: 0.35rem;
    min-height: 36px;
    padding: 0 0.85rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: transparent;
    color: var(--dark);
    font: inherit; font-size: 0.8rem; font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
}
.menu-tool:hover { border-color: var(--amber); color: var(--amber); }
.menu-tool.is-on { background: var(--amber-light); border-color: var(--amber); color: var(--amber); }

.menu-view-toggle {
    margin-inline-start: auto;
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: 999px;
    overflow: hidden;
}
.menu-view-btn {
    min-height: 36px;
    padding: 0 0.8rem;
    border: none;
    background: transparent;
    color: var(--muted);
    font: inherit; font-size: 0.78rem; font-weight: 700;
    cursor: pointer;
}
.menu-view-btn.is-active { background: var(--amber); color: #fff; }

.menu-search {
    position: relative;
    width: 100%;
    display: flex;
    align-items: center;
}
.menu-search[hidden] { display: none; }
.menu-search-close {
    position: absolute;
    inset-inline-end: 0.35rem;
    min-width: 32px; min-height: 32px;
    border: none; background: none;
    color: var(--muted);
    font: inherit; cursor: pointer;
}
.menu-search-icon {
    position: absolute;
    inset-inline-start: 0.6rem;
    font-size: 0.8rem;
    pointer-events: none;
    opacity: 0.6;
}
.menu-search input {
    width: 100%;
    padding: 0.5rem 0.75rem 0.5rem 2rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg);
    color: var(--dark);
    font: inherit;
    font-size: 0.9rem;
}
.menu-search input:focus-visible {
    outline: 2px solid var(--amber);
    outline-offset: 1px;
}
.menu-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.menu-chip {
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
}
.menu-chip:hover { border-color: var(--amber); color: var(--amber); }
.menu-chip[aria-pressed="true"] {
    background: var(--amber);
    border-color: var(--amber);
    color: #fff;
}
.menu-no-match {
    padding: 2.5rem 0;
    text-align: center;
    color: var(--muted);
}
.menu-clear {
    border: none;
    background: none;
    padding: 0;
    color: var(--amber);
    font: inherit;
    font-weight: 700;
    text-decoration: underline;
    cursor: pointer;
}
/* Filtered out. A hidden card must not stay tabbable — `hidden` alone is
   overridden by the `display:flex` on .menu-card. */
.menu-card[hidden], .menu-cat-section[hidden], .menu-subcat-block[hidden] { display: none; }

/* ── List view ──────────────────────────────────────────────────────── */
/* Same circle size as the grid — only the text moves beside it, which is
   what the order app does (.menu-card-article--list). */
.menu-main.is-list .menu-grid { grid-template-columns: 1fr; gap: 0.25rem; }
.menu-main.is-list .menu-card {
    flex-direction: row;
    align-items: center;
    gap: 0.9rem;
    text-align: start;
    padding: 0.5rem 0.25rem;
}
.menu-main.is-list .menu-card-circle { margin-bottom: 0; }
.menu-main.is-list .menu-card-body { align-items: flex-start; }
.menu-main.is-list .menu-card-desc { -webkit-line-clamp: 2; }
.menu-main.is-list .menu-card-price { margin-top: 0.2rem; }
.menu-main.is-list .menu-fav { top: 50%; transform: translateY(-50%); right: 0; }

/* ── Category band ──────────────────────────────────────────────────── */
.menu-cat-band {
    position: relative;
    height: 76px;
    border-radius: 12px;
    overflow: hidden;
    margin: 1.25rem 0 0.6rem;
    background: var(--amber-light);
    /* No scroll-margin here on purpose: the layout already sets
       html { scroll-padding-top }, and the two offsets add up. */
}
.menu-cat-band img {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    object-fit: cover; display: block;
}
.menu-cat-band-scrim {
    position: absolute; inset: 0;
    background: linear-gradient(90deg, rgba(28,20,8,0.62) 0%, rgba(28,20,8,0.24) 55%, transparent 100%);
}
.menu-cat-band-copy {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; justify-content: center;
    padding: 0.4rem 1rem;
    color: #fff;
}
.menu-cat-band h2 {
    margin: 0;
    font-size: 1.05rem; font-weight: 700; line-height: 1.2;
    color: #fff;
    text-shadow: 0 1px 3px rgba(0,0,0,0.35);
}
.menu-cat-band p {
    margin: 0.1rem 0 0;
    font-size: 0.78rem; color: rgba(255,255,255,0.88);
    display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
    overflow: hidden;
    text-shadow: 0 1px 3px rgba(0,0,0,0.35);
}

/* ── Cards: round photo, three centred lines ────────────────────────── */
.menu-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.75rem;
    align-items: stretch;
}
.menu-card {
    position: relative;
    display: flex; flex-direction: column; align-items: center;
    height: 100%;
    padding: 0.55rem 0.35rem 0.85rem;
    text-align: center;
    color: inherit;
    border-radius: 12px;
}
.menu-card-link {
    color: inherit;
    text-decoration: none;
}
/* Stretched link: the article is the positioned box; the <a> covers it.
   A heart inside that <a> would be invalid HTML, so the heart is a sibling
   with a higher z-index and the tap on the rest of the card still opens
   the item. */
.menu-card-link::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
}
.menu-card:hover .menu-card-circle { transform: translateY(-2px); }
.menu-card-link:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
.menu-fav {
    display: none;
    position: absolute;
    top: -0.15rem;
    right: max(0px, calc(50% - (var(--menu-circle) / 2) - 0.35rem));
    z-index: 1;
    min-width: 44px; min-height: 44px; width: 44px; height: 44px;
    padding: 0; border: none; border-radius: 999px;
    background: transparent;
    box-shadow: none;
    cursor: pointer;
    align-items: center; justify-content: center;
    font-size: 0.9rem; line-height: 1;
    text-decoration: none;
}
html.js .menu-fav { display: inline-flex; }
.menu-fav::before {
    content: '';
    position: absolute;
    width: 30px; height: 30px;
    border-radius: 999px;
    background: color-mix(in srgb, #FFFDF9 88%, transparent);
    box-shadow: 0 1px 5px rgba(28, 20, 8, 0.1);
    z-index: -1;
    pointer-events: none;
}

.menu-card-circle {
    position: relative;
    width: var(--menu-circle);
    aspect-ratio: 1 / 1;
    margin-bottom: 0.55rem;
    flex-shrink: 0;
    transition: transform 0.15s ease;
}
.menu-card-circle-photo {
    width: 100%; height: 100%;
    border-radius: 50%;
    overflow: hidden;
    background: var(--amber-light);
    display: flex; align-items: center; justify-content: center;
    font-size: 1.9rem;
}
/* <picture> is an inline wrapper with no size of its own. Without this the
   img's width/height:100% resolve against a shrink-to-fit box instead of the
   circle, object-fit has no box to cover, and a landscape photo renders
   letterboxed with the circle's background showing above and below it. */
.menu-card-circle-photo picture { display: block; width: 100%; height: 100%; }
.menu-card-circle-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }

.menu-card-body {
    display: flex; flex-direction: column; align-items: center;
    gap: 0.15rem;
    width: 100%; flex: 1; min-width: 0;
}
.menu-card-name {
    margin: 0;
    font-size: 1rem; font-weight: 600; line-height: 1.25;
    color: var(--dark);
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; max-width: 100%;
}
.menu-card-desc {
    margin: 0;
    font-size: 0.8125rem; line-height: 1.3;
    color: var(--muted);
    display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
    overflow: hidden; max-width: 100%;
}
.menu-card-price {
    margin-top: auto; padding-top: 0.3rem;
    font-size: 0.9375rem; font-weight: 500;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.menu-card-from { font-size: 0.75rem; }
.menu-card-price-was {
    display: inline; margin-left: 0.35rem;
    font-weight: 400; text-decoration: line-through;
    color: var(--muted); opacity: 0.75;
}
.menu-card-image-badges {
    position: absolute;
    top: 0.25rem;
    left: 50%;
    transform: translateX(calc(-50% - 2.2rem));
    z-index: 2;
    pointer-events: none;
}
.menu-card-image-badges--circle { width: max-content; max-width: 46%; }
.menu-badge-new {
    display: inline-block;
    background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%);
    color: #fff; border: none;
    font-size: 0.68rem; font-weight: 800;
    letter-spacing: 0.03em; text-transform: uppercase;
    padding: 0.24rem 0.5rem; line-height: 1.2;
    border-radius: 999px;
    box-shadow: 0 2px 8px rgba(220,38,38,0.35);
}

.menu-subcat-title {
    margin: 1rem 0 0.5rem;
    font-size: 1rem; font-weight: 700;
    color: var(--dark);
}

.menu-offers { margin: 1.25rem 0 0.5rem; }
.menu-offers-title {
    margin: 0 0 0.75rem;
    font-size: 1.05rem; font-weight: 700;
}
.menu-offer-card {
    display: flex; flex-direction: column; align-items: center;
    padding: 0.55rem 0.35rem 0.85rem;
    text-align: center; text-decoration: none; color: inherit;
    border-radius: 12px;
}
.menu-offer-badge {
    display: inline-block; margin-bottom: 0.35rem;
    font-size: 0.68rem; font-weight: 800;
    letter-spacing: 0.03em; text-transform: uppercase;
    color: #fff; background: var(--amber);
    padding: 0.2rem 0.45rem; border-radius: 999px;
}

.menu-cta { max-width: 1180px; margin: 0 auto; padding: 0 1.25rem 4rem; text-align: center; }
.menu-empty { max-width: 34rem; margin: 4rem auto; text-align: center; color: var(--muted); padding: 0 1.25rem; }

/* Dhivehi names and descriptions get the Thaana face and RTL flow even on an
   otherwise English page — an item name is content, not chrome. */
[lang="dv"] { font-family: var(--font-dhivehi); direction: rtl; }

@media (max-width: 768px) {
    /* The mobile header is the only sticky chrome — the order status bar
       under it scrolls away — so the rail clears ~64px, not the layout's
       more generous scroll-padding-top. */
    :root { --menu-rail-w: 76px; --menu-sticky: 64px; }
    .menu-shell { gap: 0.5rem; padding: 0 0.75rem 5rem; }
    .menu-grid { grid-template-columns: repeat(2, 1fr); }
    .menu-rail-thumb { width: 36px; height: 36px; }
    .menu-cat-band { height: 76px; margin-top: 1rem; }
}

/* ── Item sheet ─────────────────────────────────────────────────────────
   Slides up over the menu instead of navigating. Desktop gets a centred
   panel: a bottom sheet on a wide screen is a phone idiom stranded. */
.menu-sheet-backdrop {
    position: fixed; inset: 0; z-index: 900;
    background: rgba(28,20,8,0.45);
    animation: menu-sheet-fade 0.16s ease;
}
@keyframes menu-sheet-fade { from { opacity: 0; } to { opacity: 1; } }

.menu-sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 901;
    max-height: min(92dvh, 92vh);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    background: var(--card, #fff);
    border-radius: 20px 20px 0 0;
    box-shadow: 0 -10px 40px rgba(28,20,8,0.22);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    transform: translateY(100%);
    transition: transform 0.22s cubic-bezier(0.32, 0.72, 0, 1);
}
.menu-sheet.is-open { transform: translateY(0); }
@media (prefers-reduced-motion: reduce) {
    .menu-sheet { transition: none; }
    .menu-sheet-backdrop { animation: none; }
}

.menu-sheet-grab {
    width: 40px; height: 4px; border-radius: 999px;
    background: var(--border, #e8e0d8);
    margin: 10px auto 0;
}
.menu-sheet-close {
    position: absolute; top: 8px; right: 10px; z-index: 2;
    width: 40px; height: 40px; min-height: 40px;
    border: none; border-radius: 999px;
    background: rgba(255,255,255,0.92);
    box-shadow: 0 1px 6px rgba(28,20,8,0.16);
    font-size: 22px; line-height: 1; color: var(--dark, #1c1408);
    cursor: pointer;
}
.menu-sheet-loading {
    margin: 0; padding: 3rem 1rem; text-align: center;
    color: var(--muted, #6b5d4f); font-weight: 600;
}
/* The item body carries its own page padding; inside the sheet the top of
   it is the grab handle's job. */
.menu-sheet .menu-item-page { padding-top: 0.5rem; }
/* "Full menu" is the sheet's own close button here. */
.menu-sheet .menu-item-back { display: none; }

body.menu-sheet-open { overflow: hidden; }

@media (min-width: 768px) {
    .menu-sheet {
        left: 50%; right: auto; bottom: auto; top: 50%;
        width: min(520px, calc(100vw - 48px));
        max-height: min(86vh, 760px);
        border-radius: 18px;
        transform: translate(-50%, -46%) scale(0.98);
        opacity: 0;
        transition: transform 0.18s ease, opacity 0.18s ease;
    }
    .menu-sheet.is-open { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    .menu-sheet-grab { display: none; }
}
</style>
@endsection

@section('content')
@php
    /** Dhivehi where we have it, English otherwise — never an empty card. */
    $itemName = function ($item) use ($menuLocale) {
        if ($menuLocale === 'dv') {
            $dv = trim((string) ($item->card_name_dv ?: $item->name_dv ?: ''));
            if ($dv !== '') return ['text' => $dv, 'dv' => true];
        }
        return ['text' => (string) ($item->card_name ?: $item->name), 'dv' => false];
    };

    $itemDesc = function ($item) use ($menuLocale) {
        if ($menuLocale === 'dv') {
            $dv = trim((string) ($item->short_description_dv ?: ''));
            if ($dv !== '') return ['text' => $dv, 'dv' => true];
        }
        $en = trim((string) ($item->short_description ?: $item->description ?: ''));
        return ['text' => $en, 'dv' => false];
    };

    $categoryName = function ($category) use ($menuLocale) {
        if (! $category) return ['text' => 'More', 'dv' => false];
        if ($menuLocale === 'dv') {
            $dv = trim((string) ($category->name_dv ?: ''));
            if ($dv !== '') return ['text' => $dv, 'dv' => true];
        }
        return ['text' => (string) $category->name, 'dv' => false];
    };

    /**
     * Same rule as Item::display_image_url, applied to thumbnails and category
     * art too: a locally-hosted cafe image is rebuilt against this site's
     * origin, so a database copied from TEST still renders on production.
     * Anything else is a genuine external URL and is left alone.
     */
    $mediaUrl = function ($raw) {
        $raw = trim((string) $raw);
        if ($raw === '') return null;
        if (! str_starts_with($raw, 'http')) return url(ltrim($raw, '/'));
        $path = trim(preg_replace('#^https?://[^/]+#', '', $raw), '/');
        return str_starts_with($path, 'images/cafe/') ? url($path) : $raw;
    };

    /** Categories without art still get a distinct band rather than a grey box. */
    $tint = function ($id) {
        $hues = [18, 28, 38, 160, 200, 280];
        $h = $hues[$id % count($hues)];
        return "linear-gradient(135deg, hsl({$h} 48% 42%) 0%, hsl(" . (($h + 28) % 360) . " 42% 28%) 100%)";
    };
    $tintSoft = function ($id) {
        $hues = [18, 32, 48, 160, 200, 280];
        return 'hsl(' . $hues[$id % count($hues)] . ' 55% 88%)';
    };

    $defaultItemImage = $mediaUrl(content('default_item_image'));
    $menuOffers = $menuOffers ?? collect();
    $menuNewItemIds = $menuNewItemIds ?? [];
    $menuSpecialsByItemId = $menuSpecialsByItemId ?? [];
    $menuPriceByItemId = $menuPriceByItemId ?? [];
    $menuPhotos = $menuPhotos ?? [];
    $favouriteIds = $favouriteIds ?? [];

    $anchorFor = fn ($group) => $group['category'] ? 'cat-' . $group['category']->id : 'cat-other';

    $sectionCount = function ($group) {
        $n = count($group['items']);
        foreach ($group['subcategories'] ?? [] as $sub) {
            $n += count($sub['items']);
        }

        return $n;
    };

    // What the customer is actually charged, resolved in the controller via
    // EffectivePriceService — the same resolver the order pipeline uses. It
    // covers daily specials AND item-level auto-promotions; reading the
    // specials rows alone (as this did) advertised an auto-promoted item at
    // full price here while the app and the till both charged less.
    $priceFor = function ($item) use ($menuPriceByItemId) {
        $row = $menuPriceByItemId[$item->id] ?? null;
        if (is_array($row)) {
            return $row;
        }

        // Only reached if an item rendered without passing through the
        // controller's map. Show the catalog price rather than nothing.
        $info = $item->displayPriceInfo();
        $info['was'] = null;

        return $info;
    };
@endphp

{{-- The hero band that stood here — eyebrow, "Everything we make", and a
     tagline — was removed on the owner's call. It pushed the food most of a
     screen down on a phone, which is the whole thing this page exists to
     avoid: someone scanning the QR code at a table wants the menu, not a
     welcome.

     The <h1> stays, visually hidden. It is the page's only level-one
     heading, so removing it outright would leave the outline starting at h2
     and give search results nothing to title the page with. --}}
<h1 class="visually-hidden">Bake &amp; Grill menu</h1>

@if($menuCategories->isEmpty() && $menuOffers->isEmpty())
    <div class="menu-empty">
        <p>The menu is being updated. Please check back shortly, or call us to order.</p>
        <p style="margin-top:1rem"><a href="/contact" class="btn-primary">Contact us →</a></p>
    </div>
@else
<div class="menu-shell">
    <nav class="menu-rail" aria-label="Menu categories">
        <div class="menu-rail-list">
            @if($menuOffers->isNotEmpty())
                <a href="#menu-view-offers" data-testid="menu-offers-pill"
                   aria-label="Offers">
                    <span class="menu-rail-thumb" aria-hidden="true"
                          style="background: hsl(18 55% 88%)">%</span>
                    <span class="menu-rail-label">Offers</span>
                </a>
            @endif
            @foreach($menuCategories as $group)
                @php
                    $cat  = $group['category'];
                    $name = $categoryName($cat);
                    $thumb = $mediaUrl($cat?->thumb_url ?: $cat?->image_url);
                    $count = $sectionCount($group);
                @endphp
                {{-- The count is a bare numeral beside a name; spoken aloud it
                     reads "Shorteats 3", so the link carries it as words instead. --}}
                <a href="#{{ $anchorFor($group) }}"
                   aria-label="{{ $name['text'] }}, {{ $count }} {{ Str::plural('item', $count) }}">
                    @if($thumb)
                        <img class="menu-rail-thumb" src="{{ $thumb }}" alt="" loading="lazy" width="40" height="40">
                    @else
                        <span class="menu-rail-thumb" aria-hidden="true"
                              style="background: {{ $tintSoft($cat?->id ?? 0) }}">
                            {{ mb_strtoupper(mb_substr($name['text'], 0, 1)) }}
                        </span>
                    @endif
                    <span class="menu-rail-label" @if($name['dv']) lang="dv" @endif>{{ $name['text'] }}</span>
                    <span class="menu-rail-count" aria-hidden="true">{{ $count }}</span>
                </a>
            @endforeach
            {{-- Same last-on-rail shortcut as the order app CategoryRail.
                 Off-page: the wizard lives at /order/events, not an in-page anchor. --}}
            <a href="/order/events"
               class="menu-rail-events"
               data-testid="cat-rail-events"
               aria-label="Events">
                <span class="menu-rail-thumb" aria-hidden="true"
                      style="background: hsl(32 55% 88%)">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M5.8 11.3 2 22l10.7-3.79"/>
                        <path d="M4 3h.01"/>
                        <path d="M22 8h.01"/>
                        <path d="M15 2h.01"/>
                        <path d="M22 20h.01"/>
                        <path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/>
                        <path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17"/>
                        <path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7"/>
                        <path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/>
                    </svg>
                </span>
                <span class="menu-rail-label">Events</span>
            </a>
        </div>
    </nav>

    <div class="menu-main">
        {{-- Filtering needs JavaScript — the whole menu is in the HTML and the
             bar hides the cards that do not match. So the bar itself is hidden
             until the layout's inline script has set html.js, rather than
             offering a search box that cannot search. --}}
        <div class="menu-filters" data-testid="menu-filters">
            <div class="menu-tools">
                {{-- The search field starts collapsed behind a button, as in the
                     order app, so the toolbar does not eat a phone row before
                     anyone has asked to search. --}}
                <button type="button" class="menu-tool" id="menuSearchToggle"
                        aria-expanded="false" aria-controls="menuSearchWrap">
                    <span aria-hidden="true">🔍</span> Search
                </button>

                <div class="menu-view-toggle" role="group" aria-label="Menu layout">
                    <button type="button" class="menu-view-btn is-active" data-view="grid" aria-pressed="true">Grid</button>
                    <button type="button" class="menu-view-btn" data-view="list" aria-pressed="false">List</button>
                </div>
            </div>

            <div class="menu-search" id="menuSearchWrap" hidden>
                <label class="visually-hidden" for="menuSearch">Search the menu</label>
                <span class="menu-search-icon" aria-hidden="true">🔍</span>
                <input type="search" id="menuSearch" placeholder="Search the menu"
                       autocomplete="off" enterkeyhint="search">
                <button type="button" class="menu-search-close" aria-label="Close search">✕</button>
            </div>

            {{-- Sort is one choice, so these are radio-ish: exactly one on at a
                 time. Filters below are independent and combine. --}}
            <div class="menu-chips" role="group" aria-label="Sort the menu">
                <button type="button" class="menu-chip menu-sort is-active" data-sort="name" aria-pressed="true">A–Z</button>
                <button type="button" class="menu-chip menu-sort" data-sort="price-low" aria-pressed="false">Price ↑</button>
                <button type="button" class="menu-chip menu-sort" data-sort="price-high" aria-pressed="false">Price ↓</button>
            </div>

            @php
                $hasSpecial = collect($menuSpecialsByItemId)->isNotEmpty();
                $hasNew = ! empty($menuNewItemIds);
            @endphp
            @if($hasSpecial || $hasNew || $menuDietaryFilters !== [])
                {{-- Only chips that can actually match something. A filter that
                     always returns nothing is worse than no filter. --}}
                <div class="menu-chips" role="group" aria-label="Filter the menu">
                    @if($hasSpecial)
                        <button type="button" class="menu-chip" data-filter="special" aria-pressed="false">% Offers</button>
                    @endif
                    @if($hasNew)
                        <button type="button" class="menu-chip" data-filter="new" aria-pressed="false">New</button>
                    @endif
                    @foreach($menuDietaryFilters as $chip)
                        <button type="button" class="menu-chip" data-filter="diet:{{ $chip['slug'] }}" aria-pressed="false">{{ $chip['label'] }}</button>
                    @endforeach
                    <button type="button" class="menu-chip menu-clear-chip" hidden>Clear</button>
                </div>
            @else
                <div class="menu-chips">
                    <button type="button" class="menu-chip menu-clear-chip" hidden>Clear</button>
                </div>
            @endif
        </div>

        <p class="menu-no-match" data-testid="menu-no-match" hidden>
            Nothing on the menu matches that. <button type="button" class="menu-clear">Clear filters</button>
        </p>

        @if($menuOffers->isNotEmpty())
            <section class="menu-offers" id="menu-view-offers" data-testid="menu-view-offers">
                <h2 class="menu-offers-title">Offers</h2>
                <div class="menu-grid">
                    @foreach($menuOffers as $offer)
                        @php
                            $offerHref = \App\Support\PublicOfferUrl::fromFeedRow($offer);
                            // Prefer the gallery photo the item cards already
                            // resolved. OffersService fills image_url from
                            // display_image_url — the main image — so an offer
                            // would otherwise show the stale photo the cards
                            // were just fixed to stop showing.
                            $offerItemId = $offer['target']['item_id'] ?? null;
                            $offerPhoto = ($offerItemId ? ($menuPhotos[$offerItemId]['url'] ?? null) : null)
                                ?: $mediaUrl($offer['image_url'] ?? null)
                                ?: $defaultItemImage;
                        @endphp
                        <a class="menu-offer-card" href="{{ $offerHref }}">
                            <div class="menu-card-circle">
                                <div class="menu-card-circle-photo">
                                    @if($offerPhoto)
                                        <img src="{{ $offerPhoto }}" alt="" loading="lazy" width="132" height="132">
                                    @else
                                        <span aria-hidden="true">🍽️</span>
                                    @endif
                                </div>
                            </div>
                            @if(!empty($offer['badge']))
                                <span class="menu-offer-badge">{{ $offer['badge'] }}</span>
                            @endif
                            <span class="menu-card-name">{{ $offer['title'] ?? '' }}</span>
                            @if(isset($offer['effective_price']) && $offer['effective_price'] !== null)
                                <div class="menu-card-price">
                                    MVR {{ number_format((float) $offer['effective_price'], 2) }}
                                    @if(!empty($offer['original_price']) && (float) $offer['original_price'] > (float) $offer['effective_price'])
                                        <s class="menu-card-price-was">MVR {{ number_format((float) $offer['original_price'], 2) }}</s>
                                    @endif
                                </div>
                            @endif
                        </a>
                    @endforeach
                </div>
            </section>
        @endif
        @foreach($menuCategories as $group)
            @php
                $cat   = $group['category'];
                $name  = $categoryName($cat);
                $band  = $mediaUrl($cat?->image_url);
            @endphp
            <section class="menu-cat-section">
                {{-- The band carries the section's only heading, as it does in the
                     order app: a second <h2> under the strip read as a duplicate. --}}
                <header class="menu-cat-band" id="{{ $anchorFor($group) }}"
                        @if(! $band) style="background: {{ $tint($cat?->id ?? 0) }}" @endif>
                    @if($band)
                        <img src="{{ $band }}" alt="" loading="lazy">
                    @endif
                    <div class="menu-cat-band-scrim" aria-hidden="true"></div>
                    <div class="menu-cat-band-copy">
                        <h2 @if($name['dv']) lang="dv" @endif>{{ $name['text'] }}</h2>
                        @if($cat?->description)
                            <p>{{ $cat->description }}</p>
                        @endif
                    </div>
                </header>

                @php
                    $blocks = [];
                    if ($group['items']->isNotEmpty()) {
                        $blocks[] = ['heading' => null, 'items' => $group['items']];
                    }
                    foreach ($group['subcategories'] ?? [] as $sub) {
                        $blocks[] = ['heading' => $sub['category'], 'items' => $sub['items']];
                    }
                @endphp
                @foreach($blocks as $block)
                    {{-- Wrapped so filtering can hide a subcategory's title with
                         its items; a lone heading over an empty grid reads as a
                         rendering bug. --}}
                    <div class="menu-subcat-block">
                    @if($block['heading'])
                        @php $subName = $categoryName($block['heading']); @endphp
                        <h3 class="menu-subcat-title" @if($subName['dv']) lang="dv" @endif>{{ $subName['text'] }}</h3>
                    @endif
                    <div class="menu-grid">
                        @foreach($block['items'] as $item)
                            @php
                                $iname = $itemName($item);
                                $idesc = $itemDesc($item);
                                $price = $priceFor($item);
                                $chosen = $menuPhotos[$item->id] ?? ['url' => null, 'webp' => null];
                                $photo = $chosen['url'] ?? null;
                                $webp  = $chosen['webp'] ?? null;
                                $isNew = isset($menuNewItemIds[$item->id]);

                                // Search matches the English name too, always.
                                // A Dhivehi visitor typing "bajiya" on a Latin
                                // keyboard must still find ބަޖިޔާ.
                                $haystack = collect([
                                    $iname['text'], $idesc['text'],
                                    $item->card_name, $item->name,
                                    $item->name_dv, $item->card_name_dv,
                                ])->filter()->map(fn ($v) => mb_strtolower(trim((string) $v)))
                                  ->unique()->implode(' ');

                                $tags = collect((array) ($item->dietary_tags ?? []))
                                    ->map(fn ($t) => \App\Http\Controllers\MenuPageController::dietarySlug((string) $t))
                                    ->filter()->unique()->values()->implode(' ');
                            @endphp
                            {{-- The whole card is the tap target (stretched <a>), as in
                                 the order app. A small "Order →" caption made a 60px
                                 target next to a 130px photo that did nothing. The heart
                                 is a sibling so it is not a button inside an <a>. --}}
                            <article class="menu-card"
                                     data-search="{{ $haystack }}"
                                     data-diet="{{ $tags }}"
                                     data-name="{{ mb_strtolower($iname['text']) }}"
                                     {{-- The displayed price, so "cheapest first"
                                          agrees with what the card says. A sized
                                          item carries base_price 0, which would
                                          otherwise sort every platter to the top. --}}
                                     data-price="{{ number_format($price['price'], 2, '.', '') }}"
                                     @if($price['was'] !== null) data-special="1" @endif
                                     @if($isNew) data-new="1" @endif>
                                <a class="menu-card-link" href="/menu/{{ $item->id }}">
                                    <div class="menu-card-circle">
                                        <div class="menu-card-circle-photo">
                                            @if($photo)
                                                <picture>
                                                    @if($webp)<source srcset="{{ $webp }}" type="image/webp">@endif
                                                    <img src="{{ $photo }}" alt="{{ $iname['text'] }}"
                                                         loading="lazy" width="132" height="132">
                                                </picture>
                                            @else
                                                <span aria-hidden="true">🍽️</span>
                                            @endif
                                        </div>
                                        @if($isNew)
                                            <div class="menu-card-image-badges menu-card-image-badges--circle">
                                                <span class="menu-badge-new">New</span>
                                            </div>
                                        @endif
                                    </div>
                                    <div class="menu-card-body">
                                        {{-- Outline is h1 page → h2 category → h3 subcategory
                                             → h4 item. When the category has no subcategory
                                             the item takes the h3, so the level is not
                                             skipped — which is the common case here. --}}
                                        @php $itemHeading = $block['heading'] ? 'h4' : 'h3'; @endphp
                                        <{{ $itemHeading }} class="menu-card-name" @if($iname['dv']) lang="dv" @endif>{{ $iname['text'] }}</{{ $itemHeading }}>
                                        @if($idesc['text'] !== '')
                                            <p class="menu-card-desc" @if($idesc['dv']) lang="dv" @endif>{{ Str::limit($idesc['text'], 60) }}</p>
                                        @endif
                                        <div class="menu-card-price">
                                            {{-- An item with sizes keeps its money on the variants, so
                                                 base_price is 0 and printing it would read "MVR 0.00". --}}
                                            @if($price['from'])<span class="menu-card-from">From</span> @endif
                                            MVR {{ number_format($price['price'], 2) }}
                                            @if($price['was'] !== null)
                                                <s class="menu-card-price-was">MVR {{ number_format($price['was'], 2) }}</s>
                                            @endif
                                        </div>
                                    </div>
                                </a>
                                @include('partials.menu-favourite', ['item' => $item, 'favouriteIds' => $favouriteIds])
                            </article>
                        @endforeach
                    </div>
                    </div>{{-- /.menu-subcat-block --}}
                @endforeach
            </section>
        @endforeach
    </div>
</div>

<div class="menu-cta">
    <a href="/order/menu" class="btn-primary">Start your order →</a>
</div>

@php
    // Built as an array and emitted with @json rather than hand-written:
    // an item name with an apostrophe or a quote would otherwise produce
    // invalid JSON-LD, and Google reports that to nobody.
    $menuSchema = [
        '@context' => 'https://schema.org',
        '@type' => 'Menu',
        'name' => 'Bake & Grill menu',
        'url' => url('/menu'),
        'inLanguage' => $menuLocale === 'dv' ? 'dv' : 'en',
        'hasMenuSection' => $menuCategories->map(function ($group) use ($itemName, $itemDesc, $categoryName, $priceFor, $menuPhotos) {
            $toMenuItem = function ($item) use ($itemName, $itemDesc, $priceFor, $menuPhotos) {
                $price = $priceFor($item);
                $desc = $itemDesc($item)['text'];

                return array_filter([
                    '@type' => 'MenuItem',
                    'name' => $itemName($item)['text'],
                    'description' => $desc !== '' ? $desc : null,
                    // The full size, not the card's thumbnail: Google wants a
                    // large image for rich results, and the card deliberately
                    // asks for 400px because it draws a 132px circle.
                    'image' => ($menuPhotos[$item->id]['full'] ?? null)
                        ?: (($menuPhotos[$item->id]['url'] ?? null) ?: ($item->display_image_url ?: null)),
                    'url' => url('/menu/' . $item->id),
                    'offers' => [
                        '@type' => 'Offer',
                        'price' => number_format($price['price'], 2, '.', ''),
                        'priceCurrency' => 'MVR',
                    ],
                ], fn ($v) => $v !== null);
            };

            $section = [
                '@type' => 'MenuSection',
                'name' => $categoryName($group['category'])['text'],
                'hasMenuItem' => $group['items']->map($toMenuItem)->values()->all(),
            ];
            $nested = [];
            foreach ($group['subcategories'] ?? [] as $sub) {
                $nested[] = [
                    '@type' => 'MenuSection',
                    'name' => $categoryName($sub['category'])['text'],
                    'hasMenuItem' => $sub['items']->map($toMenuItem)->values()->all(),
                ];
            }
            if ($nested !== []) {
                $section['hasMenuSection'] = $nested;
            }

            return $section;
        })->values()->all(),
    ];
@endphp
<script type="application/ld+json">@json($menuSchema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)</script>
@endif

{{-- Filtering. Every card is already in the HTML; this only hides the ones
     that do not match, so with JS off the whole menu is still readable — the
     bar itself stays hidden in that case. --}}
<script nonce="{{ csp_nonce() }}">
(function () {
    var bar = document.querySelector('.menu-filters');
    if (!bar) return;

    var input = document.getElementById('menuSearch');
    var searchWrap = document.getElementById('menuSearchWrap');
    var searchToggle = document.getElementById('menuSearchToggle');
    var searchClose = bar.querySelector('.menu-search-close');
    var chips = Array.prototype.slice.call(bar.querySelectorAll('.menu-chip:not(.menu-sort):not(.menu-clear-chip)'));
    var sorts = Array.prototype.slice.call(bar.querySelectorAll('.menu-sort'));
    var viewBtns = Array.prototype.slice.call(bar.querySelectorAll('.menu-view-btn'));
    var clearChip = bar.querySelector('.menu-clear-chip');
    var main = document.querySelector('.menu-main');
    var grids = Array.prototype.slice.call(document.querySelectorAll('.menu-subcat-block .menu-grid'));
    var cards = Array.prototype.slice.call(document.querySelectorAll('.menu-card[data-search]'));
    var sections = Array.prototype.slice.call(document.querySelectorAll('.menu-cat-section'));
    var blocks = Array.prototype.slice.call(document.querySelectorAll('.menu-subcat-block'));
    var offers = document.getElementById('menu-view-offers');
    var noMatch = document.querySelector('.menu-no-match');
    var clear = document.querySelector('.menu-clear');

    function activeFilters() {
        return chips.filter(function (c) { return c.getAttribute('aria-pressed') === 'true'; })
                    .map(function (c) { return c.getAttribute('data-filter'); });
    }

    function matches(card, query, filters) {
        if (query && card.getAttribute('data-search').indexOf(query) === -1) return false;
        // Chips are AND, so "Offers + Vegetarian" means both, not either.
        for (var i = 0; i < filters.length; i++) {
            var f = filters[i];
            if (f === 'special' && card.getAttribute('data-special') !== '1') return false;
            if (f === 'new' && card.getAttribute('data-new') !== '1') return false;
            if (f.indexOf('diet:') === 0) {
                var want = f.slice(5);
                var have = (card.getAttribute('data-diet') || '').split(' ');
                if (have.indexOf(want) === -1) return false;
            }
        }
        return true;
    }

    function apply() {
        var query = (input && input.value || '').trim().toLowerCase();
        var filters = activeFilters();
        var filtering = query !== '' || filters.length > 0;
        var shown = 0;

        cards.forEach(function (card) {
            var ok = !filtering || matches(card, query, filters);
            card.hidden = !ok;
            if (ok) shown++;
        });

        // A heading above an empty grid reads as a broken page, so a block and
        // its section disappear once nothing inside them is left.
        blocks.forEach(function (b) {
            b.hidden = !b.querySelector('.menu-card:not([hidden])');
        });
        sections.forEach(function (s) {
            s.hidden = !s.querySelector('.menu-card:not([hidden])');
        });
        // Offers are their own cards and are not searchable; hide the strip
        // while filtering rather than leaving it as an unexplained exception.
        if (offers) offers.hidden = filtering;

        if (noMatch) noMatch.hidden = !(filtering && shown === 0);
        if (clearChip) clearChip.hidden = !filtering;
        if (searchToggle) searchToggle.classList.toggle('is-on', query !== '');

        // The rail counts what is showing, or it contradicts the page.
        document.querySelectorAll('.menu-rail a[href^="#cat-"]').forEach(function (a) {
            var el = document.getElementById(a.getAttribute('href').slice(1));
            var section = el && el.closest('.menu-cat-section');
            if (!section) return;
            var n = section.querySelectorAll('.menu-card:not([hidden])').length;
            var count = a.querySelector('.menu-rail-count');
            if (count) count.textContent = n;
            a.hidden = filtering && n === 0;
        });
    }

    // ── Sort ──────────────────────────────────────────────────────────
    // Reorders within each grid, never across the whole menu: the category
    // grouping is the page's structure and "cheapest first" must not flatten
    // it into one list.
    function applySort(mode) {
        grids.forEach(function (grid) {
            var cards = Array.prototype.slice.call(grid.children);
            cards.sort(function (a, b) {
                if (mode === 'price-low' || mode === 'price-high') {
                    var pa = parseFloat(a.getAttribute('data-price')) || 0;
                    var pb = parseFloat(b.getAttribute('data-price')) || 0;
                    if (pa !== pb) return mode === 'price-low' ? pa - pb : pb - pa;
                }
                return (a.getAttribute('data-name') || '')
                    .localeCompare(b.getAttribute('data-name') || '');
            });
            cards.forEach(function (c) { grid.appendChild(c); });
        });
    }
    sorts.forEach(function (btn) {
        btn.addEventListener('click', function () {
            sorts.forEach(function (b) {
                var on = b === btn;
                b.setAttribute('aria-pressed', on ? 'true' : 'false');
                b.classList.toggle('is-active', on);
            });
            applySort(btn.getAttribute('data-sort'));
        });
    });

    // ── Grid / list ───────────────────────────────────────────────────
    // Same localStorage key as the order app, so the choice carries across
    // the two surfaces instead of each one forgetting the other.
    var VIEW_KEY = 'bg-menu-view';
    function setView(mode) {
        if (main) main.classList.toggle('is-list', mode === 'list');
        viewBtns.forEach(function (b) {
            var on = b.getAttribute('data-view') === mode;
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            b.classList.toggle('is-active', on);
        });
        try { localStorage.setItem(VIEW_KEY, mode); } catch (e) { /* private mode */ }
    }
    viewBtns.forEach(function (b) {
        b.addEventListener('click', function () { setView(b.getAttribute('data-view')); });
    });
    try {
        if (localStorage.getItem(VIEW_KEY) === 'list') setView('list');
    } catch (e) { /* private mode */ }

    // ── Search box ────────────────────────────────────────────────────
    function openSearch(open) {
        if (!searchWrap || !searchToggle) return;
        searchWrap.hidden = !open;
        searchToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open && input) input.focus();
        if (!open && input && input.value) { input.value = ''; apply(); }
    }
    if (searchToggle) {
        searchToggle.addEventListener('click', function () {
            openSearch(searchWrap.hidden);
        });
    }
    if (searchClose) searchClose.addEventListener('click', function () { openSearch(false); });

    if (input) {
        input.addEventListener('input', apply);
        // Escape clears rather than only blurring — a search box you cannot
        // easily empty is how people end up thinking the menu is short.
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                if (input.value) { input.value = ''; apply(); } else { openSearch(false); }
            }
        });
    }
    chips.forEach(function (chip) {
        chip.addEventListener('click', function () {
            var on = chip.getAttribute('aria-pressed') === 'true';
            chip.setAttribute('aria-pressed', on ? 'false' : 'true');
            apply();
        });
    });
    function clearAll() {
        if (input) input.value = '';
        chips.forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
        apply();
    }
    if (clear) clear.addEventListener('click', clearAll);
    if (clearChip) clearChip.addEventListener('click', clearAll);
})();
</script>

{{-- Enhancement only. The rail is anchor links and the menu is already in the
     HTML; this just marks which section you are looking at. --}}
<script nonce="{{ csp_nonce() }}">
(function () {
    var links = Array.prototype.slice.call(document.querySelectorAll('.menu-rail a'));
    if (!links.length || !('IntersectionObserver' in window)) return;

    var byId = {};
    links.forEach(function (a) {
        var href = a.getAttribute('href') || '';
        // Events (and any other off-page link) is not a section id.
        // Looking up '#/order/events' would be a no-op that still pollutes byId.
        if (href.charAt(0) !== '#') return;
        byId[href.slice(1)] = a;
    });

    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            links.forEach(function (a) { a.classList.remove('is-active'); });
            var active = byId[entry.target.id];
            if (active) {
                active.classList.add('is-active');
                // The rail scrolls independently once there are more categories
                // than fit; without this the active pill drifts out of sight.
                if (active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
            }
        });
    }, { rootMargin: '-20% 0px -70% 0px' });

    Object.keys(byId).forEach(function (id) {
        var el = document.getElementById(id);
        if (el) observer.observe(el);
    });
})();
</script>
@include('partials.menu-favourite-script')

{{-- ── Item sheet ─────────────────────────────────────────────────────────
     Tapping a card used to be a page load: a blank flash, the header
     redrawn, then the item. The order app opens the same thing as a sheet
     and feels immediate, and the owner asked why the website could not.

     It can, and without giving anything up. The cards stay real <a href>
     links, so a crawler follows them to the full /menu/{id} document exactly
     as before and nothing about indexing changes. The sheet is layered on
     top: the tap is intercepted, the item's body is fetched on its own, and
     the address bar is moved to the item URL with pushState — so Share, a
     copied link and the back button all behave as if the page had loaded.

     Every failure falls back to the plain navigation. No JS, an old browser,
     a dropped request, a slow network: the link just works, the way it does
     today. That is the whole safety argument for touching the busiest page
     on the site. --}}
<div class="menu-sheet-backdrop" data-sheet-backdrop hidden></div>
<div class="menu-sheet" data-sheet role="dialog" aria-modal="true" aria-label="Menu item" hidden>
    <button type="button" class="menu-sheet-close" data-sheet-close aria-label="Close">&times;</button>
    <div class="menu-sheet-grab" aria-hidden="true"></div>
    <div class="menu-sheet-body" data-sheet-body></div>
</div>

<script nonce="{{ csp_nonce() }}">
(function () {
    var sheet = document.querySelector('[data-sheet]');
    var backdrop = document.querySelector('[data-sheet-backdrop]');
    var body = document.querySelector('[data-sheet-body]');
    var closeBtn = document.querySelector('[data-sheet-close]');
    if (!sheet || !backdrop || !body || !window.fetch || !window.history || !history.pushState) return;

    var open = false;
    var menuUrl = location.pathname + location.search;
    var lastFocus = null;
    var cache = {};

    function setOpen(on) {
        open = on;
        sheet.hidden = !on;
        backdrop.hidden = !on;
        // The page behind must not scroll under the sheet — on iOS that
        // reads as the sheet sliding off its own content.
        document.body.classList.toggle('menu-sheet-open', on);
        if (on) {
            window.requestAnimationFrame(function () { sheet.classList.add('is-open'); });
        } else {
            sheet.classList.remove('is-open');
            body.innerHTML = '';
            if (lastFocus && lastFocus.focus) lastFocus.focus();
        }
    }

    function render(html) {
        body.innerHTML = html;
        sheet.scrollTop = 0;
        // Share controls arrive with the fragment and bind on demand;
        // favourites are delegated from the document and need nothing.
        if (window.__shareInit) window.__shareInit();
        var heading = body.querySelector('h1');
        if (heading) sheet.setAttribute('aria-label', heading.textContent || 'Menu item');
    }

    function load(href) {
        if (cache[href]) { render(cache[href]); return Promise.resolve(true); }

        return fetch(href, {
            credentials: 'same-origin',
            headers: { 'X-Menu-Sheet': '1', 'Accept': 'text/html' }
        }).then(function (res) {
            if (!res.ok) throw new Error('sheet fetch failed');
            return res.text();
        }).then(function (html) {
            cache[href] = html;
            render(html);
            return true;
        });
    }

    document.addEventListener('click', function (e) {
        var link = e.target.closest ? e.target.closest('.menu-card-link') : null;
        if (!link) return;
        // Leave every deliberate "open elsewhere" gesture alone.
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

        var href = link.getAttribute('href');
        if (!href || href.charAt(0) !== '/') return;

        e.preventDefault();
        lastFocus = link;
        setOpen(true);
        body.innerHTML = '<p class="menu-sheet-loading">Loading…</p>';
        history.pushState({ menuSheet: href }, '', href);

        load(href).catch(function () {
            // Whatever went wrong, the customer still gets the item — just
            // the slow way, which is what they had before any of this.
            window.location = href;
        });
    });

    function close() {
        if (!open) return;
        // Back rather than replace, so the sheet takes one entry in history
        // and the URL returns to the menu the customer came from.
        if (history.state && history.state.menuSheet) history.back();
        else { setOpen(false); history.replaceState({}, '', menuUrl); }
    }

    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    window.addEventListener('popstate', function (e) {
        var state = e.state;
        if (state && state.menuSheet) {
            setOpen(true);
            load(state.menuSheet).catch(function () { window.location = state.menuSheet; });
            return;
        }
        if (open) setOpen(false);
    });
})();
</script>
@endsection
