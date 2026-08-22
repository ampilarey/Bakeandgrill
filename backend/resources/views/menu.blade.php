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
    display: flex; flex-direction: column; align-items: center;
    height: 100%;
    padding: 0.55rem 0.35rem 0.85rem;
    text-align: center;
    text-decoration: none;
    color: inherit;
    border-radius: 12px;
}
.menu-card:hover .menu-card-circle { transform: translateY(-2px); }
.menu-card:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }

.menu-card-circle {
    width: var(--menu-circle);
    aspect-ratio: 1 / 1;
    border-radius: 50%;
    overflow: hidden;
    background: var(--amber-light);
    display: flex; align-items: center; justify-content: center;
    font-size: 1.9rem;
    margin-bottom: 0.55rem;
    flex-shrink: 0;
    transition: transform 0.15s ease;
}
.menu-card-circle img { width: 100%; height: 100%; object-fit: cover; display: block; }

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

    $anchorFor = fn ($group) => $group['category'] ? 'cat-' . $group['category']->id : 'cat-other';

    $defaultItemImage = $mediaUrl(content('default_item_image'));
@endphp

<section class="menu-hero">
    <span class="menu-hero-eyebrow">Our Menu</span>
    <h1>Everything we make</h1>
    <p>Freshly made every day in Malé. Tap any item to order online.</p>
</section>

@if($menuCategories->isEmpty())
    <div class="menu-empty">
        <p>The menu is being updated. Please check back shortly, or call us to order.</p>
        <p style="margin-top:1rem"><a href="/contact" class="btn-primary">Contact us →</a></p>
    </div>
@else
<div class="menu-shell">
    <nav class="menu-rail" aria-label="Menu categories">
        <div class="menu-rail-list">
            @foreach($menuCategories as $group)
                @php
                    $cat  = $group['category'];
                    $name = $categoryName($cat);
                    $thumb = $mediaUrl($cat?->thumb_url ?: $cat?->image_url);
                @endphp
                {{-- The count is a bare numeral beside a name; spoken aloud it
                     reads "Shorteats 3", so the link carries it as words instead. --}}
                <a href="#{{ $anchorFor($group) }}"
                   aria-label="{{ $name['text'] }}, {{ count($group['items']) }} {{ Str::plural('item', count($group['items'])) }}">
                    @if($thumb)
                        <img class="menu-rail-thumb" src="{{ $thumb }}" alt="" loading="lazy" width="40" height="40">
                    @else
                        <span class="menu-rail-thumb" aria-hidden="true"
                              style="background: {{ $tintSoft($cat?->id ?? 0) }}">
                            {{ mb_strtoupper(mb_substr($name['text'], 0, 1)) }}
                        </span>
                    @endif
                    <span class="menu-rail-label" @if($name['dv']) lang="dv" @endif>{{ $name['text'] }}</span>
                    <span class="menu-rail-count" aria-hidden="true">{{ count($group['items']) }}</span>
                </a>
            @endforeach
        </div>
    </nav>

    <div class="menu-main">
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

                <div class="menu-grid">
                    @foreach($group['items'] as $item)
                        @php
                            $iname = $itemName($item);
                            $idesc = $itemDesc($item);
                            $price = $item->displayPriceInfo();
                            $photo = $mediaUrl($item->thumb_url ?: $item->image_url) ?: $defaultItemImage;
                            $webp  = $mediaUrl($item->thumb_webp_url ?: $item->image_webp_url);
                        @endphp
                        {{-- The whole card is the link, as in the order app. A small
                             "Order →" caption made a 60px tap target next to a 130px
                             photo that did nothing. --}}
                        <a class="menu-card" href="/order/menu?item={{ $item->id }}">
                            <div class="menu-card-circle">
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
                            <div class="menu-card-body">
                                {{-- A real heading, not a styled span: the page's outline is
                                     h1 page → h2 category → h3 item, which is what a crawler
                                     reads the menu's structure from. --}}
                                <h3 class="menu-card-name" @if($iname['dv']) lang="dv" @endif>{{ $iname['text'] }}</h3>
                                @if($idesc['text'] !== '')
                                    <p class="menu-card-desc" @if($idesc['dv']) lang="dv" @endif>{{ Str::limit($idesc['text'], 60) }}</p>
                                @endif
                                <div class="menu-card-price">
                                    {{-- An item with sizes keeps its money on the variants, so
                                         base_price is 0 and printing it would read "MVR 0.00". --}}
                                    @if($price['from'])<span class="menu-card-from">From</span> @endif
                                    MVR {{ number_format($price['price'], 2) }}
                                </div>
                            </div>
                        </a>
                    @endforeach
                </div>
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
        'hasMenuSection' => $menuCategories->map(function ($group) use ($itemName, $itemDesc, $categoryName) {
            return [
                '@type' => 'MenuSection',
                'name' => $categoryName($group['category'])['text'],
                'hasMenuItem' => $group['items']->map(function ($item) use ($itemName, $itemDesc) {
                    $price = $item->displayPriceInfo();
                    $desc = $itemDesc($item)['text'];

                    return array_filter([
                        '@type' => 'MenuItem',
                        'name' => $itemName($item)['text'],
                        'description' => $desc !== '' ? $desc : null,
                        'image' => $item->display_image_url ?: null,
                        'offers' => [
                            '@type' => 'Offer',
                            'price' => number_format($price['price'], 2, '.', ''),
                            'priceCurrency' => 'MVR',
                        ],
                    ], fn ($v) => $v !== null);
                })->values()->all(),
            ];
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
@endsection
