{{-- One menu card. Included from the category sections and from the
     Event & catering section so the two cannot drift. Everything the card
     reads — $itemName, $itemDesc, $priceFor, $menuPhotos, $menuNewItemIds,
     $menuSoldOut, $menuBundles, $favouriteIds — arrives from the parent
     view's scope; $item and $itemHeading are passed explicitly. --}}
@php
    $iname = $itemName($item);
    $idesc = $itemDesc($item);
    $price = $priceFor($item);
    $chosen = $menuPhotos[$item->id] ?? ['url' => null, 'webp' => null];
    $photo = $chosen['url'] ?? null;
    $webp  = $chosen['webp'] ?? null;
    $isNew = isset($menuNewItemIds[$item->id]);
    $soldOut = $menuSoldOut[$item->id] ?? null;
    $bundle = $menuBundles[$item->id] ?? null;

    // Search matches the English name too, always.
    // A Dhivehi visitor typing "bajiya" on a Latin
    // keyboard must still find ބަޖިޔާ.
    $haystack = collect([
        $iname['text'], $idesc['text'],
        $item->card_name, $item->name,
        $item->name_dv, $item->card_name_dv,
    ])
      // A bundle is findable by what is in it. Somebody
      // searching "chicken" wants the family bundle that
      // contains chicken, not only dishes named for it.
      ->concat(collect($bundle['contents'] ?? [])->pluck('name'))
      ->concat(collect($bundle['groups'] ?? [])->flatMap(fn ($g) => $g['choices']))
      ->filter()->map(fn ($v) => mb_strtolower(trim((string) $v)))
      ->unique()->implode(' ');

    $tags = collect((array) ($item->dietary_tags ?? []))
        ->map(fn ($t) => \App\Http\Controllers\MenuPageController::dietarySlug((string) $t))
        ->filter()->unique()->values()->implode(' ');
@endphp
{{-- The whole card is the tap target (stretched <a>), as in
     the order app. A small "Order →" caption made a 60px
     target next to a 130px photo that did nothing. The heart
     is a sibling so it is not a button inside an <a>. --}}
{{-- A sold-out dish stays on the page, dimmed and still a link
     (owner, 2026-09-21): the details are what a customer taps
     for, and a dish that vanishes reads as "they don't make
     this" rather than "come back tomorrow". --}}
<article class="{{ $soldOut ? 'menu-card menu-card--sold-out' : 'menu-card' }}"
         data-search="{{ $haystack }}"
         data-diet="{{ $tags }}"
         data-name="{{ mb_strtolower($iname['text']) }}"
         {{-- The displayed price, so "cheapest first"
              agrees with what the card says. A sized
              item carries base_price 0, which would
              otherwise sort every platter to the top. --}}
         data-price="{{ number_format($price['price'], 2, '.', '') }}"
         @if($price['was'] !== null) data-special="1" @endif
         @if($isNew) data-new="1" @endif
         @if($soldOut) data-sold-out="1" @endif>
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
            @if($soldOut)
                <div class="menu-card-image-badges menu-card-image-badges--circle">
                    <span class="menu-badge-soldout">{{ $soldOut }}</span>
                </div>
            @elseif($isNew)
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
            <{{ $itemHeading }} class="menu-card-name" @if($iname['dv']) lang="dv" @endif>{{ $iname['text'] }}</{{ $itemHeading }}>
            @if($idesc['text'] !== '')
                <p class="menu-card-desc" @if($idesc['dv']) lang="dv" @endif>{{ Str::limit($idesc['text'], 60) }}</p>
            @endif
            @if($bundle)
                <span class="menu-card-bundle">{{ $bundle['label'] }}</span>
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
