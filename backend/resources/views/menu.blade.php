@extends('layout')

@section('title', 'Menu – Bake & Grill')
@section('description', 'The full Bake &amp; Grill menu — Dhivehi hedhikaa, fast food, sweet treats and drinks, freshly made in Malé. Prices in MVR.')

@section('styles')
<style>
/* Server-rendered so a crawler — and a phone on weak data at a table — get
   the food before any JavaScript runs. The category rail below enhances it;
   nothing here depends on the rail working. */
.menu-hero {
    background: linear-gradient(160deg, var(--amber-light) 0%, var(--bg) 60%);
    border-bottom: 1px solid var(--border);
    padding: 3.5rem 2rem 2.5rem;
    text-align: center;
}
.menu-hero-eyebrow {
    display: inline-block;
    font-size: 0.72rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--amber); margin-bottom: 0.75rem;
}
.menu-hero h1 {
    font-size: 2.5rem; font-weight: 800;
    letter-spacing: -0.04em; color: var(--dark);
    margin-bottom: 0.75rem;
}
.menu-hero p { color: var(--muted); max-width: 34rem; margin: 0 auto; }
@media (max-width: 600px) { .menu-hero { padding: 2.5rem 1.25rem 2rem; } .menu-hero h1 { font-size: 1.9rem; } }

/* Sticky category rail. Plain anchor links, so it works before JS and keeps
   working without it. */
.menu-rail {
    position: sticky; top: 0; z-index: 20;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    overflow-x: auto; -webkit-overflow-scrolling: touch;
}
.menu-rail-inner {
    display: flex; gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    max-width: 1100px; margin: 0 auto;
    white-space: nowrap;
}
.menu-rail a {
    flex: 0 0 auto;
    padding: 0.45rem 0.9rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    color: var(--dark); text-decoration: none;
    font-size: 0.85rem; font-weight: 600;
}
.menu-rail a:hover, .menu-rail a.is-active { background: var(--amber); border-color: var(--amber); color: #fff; }

.menu-section { max-width: 1100px; margin: 0 auto; padding: 2.5rem 1.25rem 0; }
.menu-section h2 {
    font-size: 1.5rem; font-weight: 800; color: var(--dark);
    letter-spacing: -0.02em; margin-bottom: 0.35rem;
    scroll-margin-top: 4.5rem; /* clears the sticky rail on anchor jump */
}
.menu-section-desc { color: var(--muted); font-size: 0.92rem; margin-bottom: 1.25rem; }

.menu-grid {
    display: grid; gap: 1rem;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
}
.menu-item {
    display: flex; gap: 0.9rem;
    border: 1px solid var(--border); border-radius: 14px;
    padding: 0.85rem; background: #fff;
}
.menu-item-img {
    flex: 0 0 76px; width: 76px; height: 76px;
    border-radius: 10px; overflow: hidden;
    background: var(--amber-light);
    display: flex; align-items: center; justify-content: center;
    font-size: 1.6rem;
}
.menu-item-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.menu-item-body { min-width: 0; flex: 1; display: flex; flex-direction: column; }
.menu-item-name { font-weight: 700; color: var(--dark); line-height: 1.3; }
.menu-item-desc {
    color: var(--muted); font-size: 0.84rem; line-height: 1.45;
    margin-top: 0.2rem;
}
.menu-item-foot {
    margin-top: auto; padding-top: 0.6rem;
    display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem;
}
.menu-item-price { font-weight: 800; color: var(--dark); white-space: nowrap; }
.menu-item-from { font-size: 0.7rem; color: var(--muted); font-weight: 600; margin-right: 0.2rem; }
.menu-item-order {
    font-size: 0.8rem; font-weight: 700;
    color: var(--amber); text-decoration: none; white-space: nowrap;
}
.menu-item-order:hover { text-decoration: underline; }

.menu-cta { max-width: 1100px; margin: 3rem auto 0; padding: 0 1.25rem 4rem; text-align: center; }
.menu-empty { max-width: 34rem; margin: 4rem auto; text-align: center; color: var(--muted); padding: 0 1.25rem; }

/* Dhivehi names and descriptions get the Thaana face and RTL flow even on an
   otherwise English page — an item name is content, not chrome. */
[lang="dv"] { font-family: var(--font-dhivehi); direction: rtl; }
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

    $anchorFor = fn ($group, $i) => $group['category']
        ? 'cat-' . $group['category']->id
        : 'cat-other';
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
    <nav class="menu-rail" aria-label="Menu categories">
        <div class="menu-rail-inner">
            @foreach($menuCategories as $i => $group)
                <a href="#{{ $anchorFor($group, $i) }}">
                    {{ $group['category']?->name ?? 'More' }}
                </a>
            @endforeach
        </div>
    </nav>

    @foreach($menuCategories as $i => $group)
        <section class="menu-section">
            <h2 id="{{ $anchorFor($group, $i) }}">
                {{ $group['category']?->name ?? 'More' }}
            </h2>
            @if($group['category']?->description)
                <p class="menu-section-desc">{{ $group['category']->description }}</p>
            @endif

            <div class="menu-grid">
                @foreach($group['items'] as $item)
                    @php
                        $name  = $itemName($item);
                        $desc  = $itemDesc($item);
                        $price = $item->displayPriceInfo();
                        $img   = $item->display_image_url;
                    @endphp
                    <article class="menu-item">
                        <div class="menu-item-img">
                            @if($img)
                                <img src="{{ $img }}" alt="{{ $name['text'] }}" loading="lazy" width="76" height="76">
                            @else
                                <span aria-hidden="true">🍽️</span>
                            @endif
                        </div>
                        <div class="menu-item-body">
                            <div class="menu-item-name" @if($name['dv']) lang="dv" @endif>{{ $name['text'] }}</div>
                            @if($desc['text'] !== '')
                                <div class="menu-item-desc" @if($desc['dv']) lang="dv" @endif>{{ Str::limit($desc['text'], 90) }}</div>
                            @endif
                            <div class="menu-item-foot">
                                <span class="menu-item-price">
                                    {{-- An item with sizes keeps its money on the variants, so
                                         base_price is 0 and printing it would read "MVR 0.00". --}}
                                    @if($price['from'])<span class="menu-item-from">From</span>@endif
                                    MVR {{ number_format($price['price'], 2) }}
                                </span>
                                <a class="menu-item-order" href="/order/menu?item={{ $item->id }}">Order →</a>
                            </div>
                        </div>
                    </article>
                @endforeach
            </div>
        </section>
    @endforeach

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
            'hasMenuSection' => $menuCategories->map(function ($group) use ($itemName, $itemDesc) {
                return [
                    '@type' => 'MenuSection',
                    'name' => $group['category']?->name ?? 'More',
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
            if (active) active.classList.add('is-active');
        });
    }, { rootMargin: '-20% 0px -70% 0px' });

    Object.keys(byId).forEach(function (id) {
        var el = document.getElementById(id);
        if (el) observer.observe(el);
    });
})();
</script>
@endsection
