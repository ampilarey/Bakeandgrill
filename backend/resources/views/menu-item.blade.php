@extends('layout')

@php
    $itemName = function ($item) use ($menuLocale) {
        if ($menuLocale === 'dv') {
            $dv = trim((string) ($item->card_name_dv ?: $item->name_dv ?: ''));
            if ($dv !== '') return ['text' => $dv, 'dv' => true];
        }

        return ['text' => (string) ($item->card_name ?: $item->name), 'dv' => false];
    };
    $iname = $itemName($item);
    $englishName = (string) ($item->card_name ?: $item->name);
    $dvName = trim((string) ($item->name_dv ?: ''));

    $desc = trim((string) ($item->description ?: ''));
    if ($menuLocale === 'dv') {
        $dvDesc = trim((string) ($item->short_description_dv ?: ''));
        // There is no full Dhivehi description column; keep the English body
        // when that is what we have, rather than falling back to a clamp.
        if ($dvDesc !== '' && $desc === '') {
            $desc = $dvDesc;
        }
    }

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
    $price = $priceFor($item);
    $chosen = $menuPhotos[$item->id] ?? ['url' => null, 'webp' => null];
    $photo = $chosen['url'] ?? null;
    $webp = $chosen['webp'] ?? null;
    $variants = $item->variants->where('is_active', true)->sortBy('sort_order')->values();
    $dietary = array_values(array_filter((array) ($item->dietary_tags ?? [])));
    $allergens = array_values(array_filter((array) ($item->allergens ?? [])));
    $spice = $item->spice_level && $item->spice_level !== 'none' ? $item->spice_level : null;
    $spiceLabel = [
        'mild' => '🌶 Mild',
        'medium' => '🌶🌶 Medium',
        'hot' => '🌶🌶🌶 Hot',
        'extra_hot' => '🔥 Extra Hot',
    ][$spice] ?? ($spice ? ucwords(str_replace('_', ' ', $spice)) : null);
    $pageTitle = $iname['text'] . ' – Menu – Bake & Grill';
    $pageDesc = $desc !== '' ? \Illuminate\Support\Str::limit($desc, 160) : $iname['text'] . ' at Bake & Grill. Prices in MVR.';
@endphp

@section('title', $pageTitle)
@section('description', $pageDesc)

@section('styles')
<style>
.menu-item-page { max-width: 560px; margin: 0 auto; padding: 1.25rem 1.25rem 4rem; }
.menu-item-back {
    display: inline-block; margin-bottom: 1rem;
    font-size: 0.875rem; font-weight: 600; color: var(--amber); text-decoration: none;
}
.menu-item-back:hover { text-decoration: underline; }
.menu-item-hero {
    position: relative;
    aspect-ratio: 16 / 10;
    border-radius: 16px;
    overflow: hidden;
    background: var(--amber-light);
    display: flex; align-items: center; justify-content: center;
    font-size: 2.75rem;
    margin-bottom: 1.15rem;
}
.menu-item-hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
.menu-item-page .menu-fav {
    display: none;
    position: absolute; top: 0.65rem; right: 0.65rem;
    z-index: 1;
    min-width: 44px; min-height: 44px; width: 44px; height: 44px;
    padding: 0; border: none; border-radius: 999px;
    background: rgba(255,253,249,0.92);
    box-shadow: 0 1px 5px rgba(28,20,8,0.12);
    cursor: pointer;
    align-items: center; justify-content: center;
    font-size: 1rem; line-height: 1;
    text-decoration: none;
}
html.js .menu-item-page .menu-fav { display: inline-flex; }
.menu-item-name {
    margin: 0 0 0.2rem;
    font-size: 1.6rem; font-weight: 800; letter-spacing: -0.03em;
    color: var(--dark); line-height: 1.25;
}
.menu-item-name-alt {
    margin: 0 0 0.55rem;
    font-size: 0.95rem; color: var(--muted); font-weight: 500;
}
.menu-item-price {
    display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.45rem;
    margin: 0 0 0.85rem;
    font-size: 1.15rem; font-weight: 800; color: var(--amber);
}
.menu-item-from { font-size: 0.8rem; font-weight: 600; }
.menu-item-was {
    font-size: 0.85rem; font-weight: 500; text-decoration: line-through;
    color: var(--muted);
}
.menu-item-meta { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 0.85rem; }
.menu-item-chip {
    font-size: 0.75rem; font-weight: 700; color: var(--dark);
    background: var(--bg); padding: 0.28rem 0.65rem;
    border-radius: 999px; border: 1px solid var(--border);
}
.menu-item-diet { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 0.85rem; }
.menu-item-diet span {
    font-size: 0.7rem; font-weight: 700; text-transform: capitalize;
    color: var(--amber); background: var(--amber-light);
    padding: 0.22rem 0.55rem; border-radius: 999px;
}
.menu-item-desc {
    margin: 0 0 1rem;
    font-size: 0.95rem; line-height: 1.55; color: var(--muted);
    white-space: pre-line;
}
.menu-item-allergens {
    margin: 0 0 1.1rem; padding: 0.75rem 0.9rem;
    background: #FFF7ED; border: 1px solid #FDBA74; border-radius: 12px;
}
.menu-item-allergens p { margin: 0; }
.menu-item-allergens-label {
    font-size: 0.78rem; font-weight: 800; color: #9A3412; letter-spacing: 0.02em;
}
.menu-item-allergens-list {
    margin-top: 0.25rem;
    font-size: 0.85rem; color: #7C2D12; text-transform: capitalize; line-height: 1.4;
}
.menu-item-variants { margin: 0 0 1.25rem; padding: 0; list-style: none; }
.menu-item-variants li {
    display: flex; justify-content: space-between; gap: 1rem;
    padding: 0.55rem 0;
    border-bottom: 1px solid var(--border);
    font-size: 0.95rem;
}
.menu-item-variants li:first-child { border-top: 1px solid var(--border); }
.menu-item-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.menu-item-actions .btn-primary { flex: 1 1 12rem; text-align: center; }
.menu-item-cart {
    display: inline-flex; align-items: center; justify-content: center;
    min-height: 44px; padding: 0.65rem 1.1rem;
    border-radius: 999px; border: 1px solid var(--border);
    color: var(--dark); text-decoration: none; font-weight: 600;
}
[lang="dv"] { font-family: var(--font-dhivehi); direction: rtl; }
@media (max-width: 768px) {
    .menu-item-page { padding: 1rem 1rem 5rem; }
}
</style>
@endsection

@section('content')
<article class="menu-item-page">
    <a class="menu-item-back" href="/menu">← Full menu</a>

    <div class="menu-item-hero">
        @if($photo)
            <picture>
                @if($webp)<source srcset="{{ $webp }}" type="image/webp">@endif
                <img src="{{ $photo }}" alt="{{ $iname['text'] }}" width="640" height="400">
            </picture>
        @else
            <span aria-hidden="true">🍽️</span>
        @endif
        @include('partials.menu-favourite', ['item' => $item, 'favouriteIds' => $favouriteIds ?? []])
    </div>

    <h1 class="menu-item-name" @if($iname['dv']) lang="dv" @endif>{{ $iname['text'] }}</h1>
    @if($dvName !== '' && $menuLocale !== 'dv')
        <p class="menu-item-name-alt" lang="dv">{{ $dvName }}</p>
    @elseif($menuLocale === 'dv' && $iname['dv'] && $englishName !== $iname['text'])
        <p class="menu-item-name-alt">{{ $englishName }}</p>
    @endif

    <div class="menu-item-price">
        @if($price['from'])<span class="menu-item-from">From</span> @endif
        MVR {{ number_format($price['price'], 2) }}
        @if($price['was'] !== null)
            <s class="menu-item-was">MVR {{ number_format($price['was'], 2) }}</s>
        @endif
    </div>

    @if($spiceLabel || ($item->prep_time_minutes && $item->prep_time_minutes > 0) || ($item->calories && $item->calories > 0))
        <div class="menu-item-meta">
            @if($spiceLabel)<span class="menu-item-chip">{{ $spiceLabel }}</span>@endif
            @if($item->prep_time_minutes && $item->prep_time_minutes > 0)
                <span class="menu-item-chip">⏱ {{ $item->prep_time_minutes }} min</span>
            @endif
            @if($item->calories && $item->calories > 0)
                <span class="menu-item-chip">~{{ $item->calories }} kcal</span>
            @endif
        </div>
    @endif

    @if($dietary !== [])
        <div class="menu-item-diet">
            @foreach($dietary as $tag)
                <span>{{ str_replace('-', ' ', $tag) }}</span>
            @endforeach
        </div>
    @endif

    @if($desc !== '')
        <p class="menu-item-desc">{{ $desc }}</p>
    @endif

    @if($allergens !== [])
        <div class="menu-item-allergens">
            <p class="menu-item-allergens-label">CONTAINS</p>
            <p class="menu-item-allergens-list">{{ collect($allergens)->map(fn ($a) => str_replace('-', ' ', $a))->implode(' · ') }}</p>
        </div>
    @endif

    @if($variants->isNotEmpty())
        <ul class="menu-item-variants">
            @foreach($variants as $variant)
                <li>
                    <span>{{ $variant->name }}</span>
                    <span>MVR {{ number_format((float) $variant->price, 2) }}</span>
                </li>
            @endforeach
        </ul>
    @endif

    <div class="menu-item-actions">
        <a href="/order/menu?item={{ $item->id }}" class="btn-primary">Add to order</a>
        <a href="/order/menu" class="menu-item-cart">View cart</a>
    </div>
</article>

@php
    $itemSchema = array_filter([
        '@context' => 'https://schema.org',
        '@type' => 'MenuItem',
        'name' => $iname['text'],
        'description' => $desc !== '' ? $desc : null,
        'image' => $photo,
        'url' => url('/menu/' . $item->id),
        'offers' => [
            '@type' => 'Offer',
            'price' => number_format($price['price'], 2, '.', ''),
            'priceCurrency' => 'MVR',
        ],
    ], fn ($v) => $v !== null);
@endphp
<script type="application/ld+json">@json($itemSchema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)</script>
@include('partials.menu-favourite-script')
@endsection
