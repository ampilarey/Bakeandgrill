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

.menu-hero {
    background: linear-gradient(160deg, var(--amber-light) 0%, var(--bg) 60%);
    border-bottom: 1px solid var(--border);
    padding: 2.75rem 2rem 2rem;
    text-align: center;
}
.menu-hero-eyebrow {
    display: inline-block;
    font-size: 0.72rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--amber); margin-bottom: 0.6rem;
}
.menu-hero h1 {
    font-size: 2.4rem; font-weight: 800;
    letter-spacing: -0.04em; color: var(--dark);
    margin-bottom: 0.6rem;
}
.menu-hero p { color: var(--muted); max-width: 34rem; margin: 0 auto; }

/* ── Shell: sticky rail + sections ──────────────────────────────────── */
.menu-shell {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    max-width: 1180px;
    margin: 0 auto;
    padding: 0 1.25rem 4rem;
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

.menu-main { flex: 1; min-width: 0; }

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
    .menu-hero { padding: 2rem 1.25rem 1.5rem; }
    .menu-hero h1 { font-size: 1.9rem; }
    .menu-shell { gap: 0.5rem; padding: 0 0.75rem 5rem; }
    .menu-grid { grid-template-columns: repeat(2, 1fr); }
    .menu-rail-thumb { width: 36px; height: 36px; }
    .menu-cat-band { height: 76px; margin-top: 1rem; }
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

    $priceFor = function ($item) use ($menuSpecialsByItemId) {
        $info = $item->displayPriceInfo();
        $rows = $menuSpecialsByItemId[$item->id] ?? [];
        $best = null;
        foreach ($rows as $row) {
            $effective = isset($row['effective_price']) ? (float) $row['effective_price'] : null;
            if ($effective === null) {
                continue;
            }
            if ($best === null || $effective < $best) {
                $best = $effective;
            }
        }
        $info['was'] = null;
        if ($best !== null && $best < (float) $info['price']) {
            $info['was'] = (float) $info['price'];
            $info['price'] = $best;
        }

        return $info;
    };
@endphp

<section class="menu-hero">
    <span class="menu-hero-eyebrow">Our Menu</span>
    <h1>Everything we make</h1>
    <p>Freshly made every day in Malé. Tap any item for details, then add it to your order.</p>
</section>

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
        </div>
    </nav>

    <div class="menu-main">
        @if($menuOffers->isNotEmpty())
            <section class="menu-offers" id="menu-view-offers" data-testid="menu-view-offers">
                <h2 class="menu-offers-title">Offers</h2>
                <div class="menu-grid">
                    @foreach($menuOffers as $offer)
                        @php
                            $offerLink = $offer['link'] ?? '/menu';
                            $offerHref = str_starts_with((string) $offerLink, '/menu')
                                ? '/order' . $offerLink
                                : $offerLink;
                        @endphp
                        <a class="menu-offer-card" href="{{ $offerHref }}">
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
            <section>
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
                            @endphp
                            {{-- The whole card is the tap target (stretched <a>), as in
                                 the order app. A small "Order →" caption made a 60px
                                 target next to a 130px photo that did nothing. The heart
                                 is a sibling so it is not a button inside an <a>. --}}
                            <article class="menu-card">
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
                                        {{-- Outline is deliberate: h1 page → h2 category →
                                             h3 subcategory (when present) → h4 item. --}}
                                        <h4 class="menu-card-name" @if($iname['dv']) lang="dv" @endif>{{ $iname['text'] }}</h4>
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
                    'image' => ($menuPhotos[$item->id]['url'] ?? null) ?: ($item->display_image_url ?: null),
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

{{-- Enhancement only. The rail is anchor links and the menu is already in the
     HTML; this just marks which section you are looking at. --}}
<script nonce="{{ csp_nonce() }}">
(function () {
    var links = Array.prototype.slice.call(document.querySelectorAll('.menu-rail a'));
    if (!links.length || !('IntersectionObserver' in window)) return;

    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });

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
@endsection
