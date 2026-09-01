{{-- The layout is a variable so this one file serves two shapes.

     Normally it extends the site layout and is the document a crawler indexes
     and a shared link opens. The menu grid asks for the same view through
     `layouts.fragment`, which emits the content section alone, and drops that
     into a bottom sheet — so tapping a card costs a fetch instead of a page
     load. One file means the sheet cannot drift from the page it stands in
     for. Owner, 2026-09-01. --}}
@php $menuItemLayout = $menuItemLayout ?? 'layout'; $isFragment = $menuItemLayout !== 'layout'; @endphp
@extends($menuItemLayout)

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

    // See menu.blade.php — the charged price comes from the controller's
    // EffectivePriceService map, not the daily-special rows alone.
    $menuPriceByItemId = $menuPriceByItemId ?? [];
    $priceFor = function ($item) use ($menuPriceByItemId) {
        $row = $menuPriceByItemId[$item->id] ?? null;
        if (is_array($row)) {
            return $row;
        }

        $info = $item->displayPriceInfo();
        $info['was'] = null;

        return $info;
    };
    $price = $priceFor($item);
    $chosen = $menuPhotos[$item->id] ?? ['url' => null, 'webp' => null, 'placeholder' => false];
    $photo = $chosen['url'] ?? null;
    $webp = $chosen['webp'] ?? null;
    // The stand-in logo must not be cropped into the hero — see the CSS below.
    $photoIsPlaceholder = (bool) ($chosen['placeholder'] ?? false);
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
    $itemAvailable = $itemAvailable ?? true;
    $alternatives = $alternatives ?? collect();
    $menuVariantPrices = $menuVariantPrices ?? [];
    $socialImage = $socialImage ?? ['url' => '', 'alt' => $iname['text']];
    $shareUrl = url('/menu/' . $item->id);
@endphp

@section('title', $pageTitle)
@section('description', $pageDesc)
@section('og_image', $socialImage['url'])
@section('og_image_alt', $socialImage['alt'])
@if(!empty($socialImage['width']) && !empty($socialImage['height']))
@section('og_image_width', $socialImage['width'])
@section('og_image_height', $socialImage['height'])
@endif
@section('og_url', $shareUrl)
@section('twitter_image', $socialImage['url'])

@section('styles')
@include('partials.menu-item-styles')
@endsection

@section('content')
<article class="menu-item-page">
    <div class="menu-item-topbar">
        <a class="menu-item-back" href="/menu"><span aria-hidden="true">←</span> Full menu</a>
        @include('partials.share-control', [
            'shareUrl' => $shareUrl,
            'shareTitle' => $iname['text'],
            'shareText' => $iname['text'] . ' at Bake & Grill',
            'shareButtonClass' => 'btn-outline',
        ])
    </div>

    <div class="menu-item-hero @if($photo && $photoIsPlaceholder)menu-item-hero--placeholder @endif">
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

    @if(! $itemAvailable)
        <div class="menu-item-unavailable" data-testid="item-unavailable">
            <p>Currently unavailable</p>
            <p class="menu-item-unavailable-note">This item is not on the menu right now. You can still share the page, or browse something else.</p>
        </div>
    @endif

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
                @php $vPrice = $menuVariantPrices[$variant->id] ?? ['price' => (float) $variant->price, 'was' => null]; @endphp
                <li>
                    <span>{{ $variant->name }}</span>
                    <span>
                        MVR {{ number_format((float) $vPrice['price'], 2) }}
                        @if(!empty($vPrice['was']))
                            <s class="menu-item-was">MVR {{ number_format((float) $vPrice['was'], 2) }}</s>
                        @endif
                    </span>
                </li>
            @endforeach
        </ul>
    @endif

    <div class="menu-item-actions">
        @if($itemAvailable)
            <a href="/order/menu?item={{ $item->id }}" class="btn-primary">Add to order</a>
            <a href="/order/menu" class="btn-outline">View cart</a>
        @else
            <a href="/menu" class="btn-primary">Today’s menu</a>
            @if($item->category_id)
                <a href="/menu#cat-{{ $item->category_id }}" class="btn-outline">More in this category</a>
            @endif
        @endif
    </div>

    @if(! $itemAvailable && $alternatives->isNotEmpty())
        <div class="menu-item-alts">
            <h2>You might like</h2>
            <ul>
                @foreach($alternatives as $alt)
                    <li><a href="/menu/{{ $alt->id }}">{{ $alt->card_name ?: $alt->name }}</a></li>
                @endforeach
            </ul>
        </div>
    @endif
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
@unless($isFragment)
    {{-- A panel is not a page: repeating this inside the sheet would describe
         a document that does not exist, and the script would not run anyway
         (injected inline scripts are blocked by the CSP nonce). The menu page
         already carries the delegated favourites handler. --}}
    <script type="application/ld+json">@json($itemSchema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)</script>
    @include('partials.menu-favourite-script')
@endunless
@endsection
