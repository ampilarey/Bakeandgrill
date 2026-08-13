@php
    $sectionClass = (($stripeIndex ?? 0) % 2 === 0) ? 'section' : 'section alt';
    $homeOffers = isset($homeOffers) ? $homeOffers : (isset($offers) ? $offers : collect());
    $offersHeadline = content('offers_headline', 'Offers');
    $offersSubtext = content('offers_subtext', 'Specials and promos running right now.');
    $defaultItemImage = $defaultItemImage ?? content('default_item_image');
@endphp

@if($homeOffers->count() > 0)
<section class="{{ $sectionClass }}" id="offers">
    <div class="section-inner">
        <div class="section-header">
            <span class="section-eyebrow">Limited time</span>
            <h2 class="section-title">{{ $offersHeadline }}</h2>
            <p class="section-sub">{{ $offersSubtext }}</p>
        </div>
        <div class="specials-scroll">
            @foreach($homeOffers as $offer)
            <a href="{{ url('/order' . ($offer['link'] ?? '/menu')) }}" class="special-card">
                <div class="product-img product-img--circle">
                    @if(!empty($offer['image_url']))
                        <img src="{{ $offer['image_url'] }}" alt="{{ $offer['title'] ?? '' }}">
                    @elseif(!empty($defaultItemImage))
                        <img src="{{ $defaultItemImage }}" alt="{{ $offer['title'] ?? '' }}" data-default-item-image="1">
                    @else
                        @php $brandLogo = content('logo'); @endphp
                        <div class="product-img-placeholder product-img-placeholder--brand" aria-hidden="true">
                            @if($brandLogo)
                                <img src="{{ $brandLogo }}" alt="" class="product-img-placeholder__logo">
                            @else
                                <span class="product-img-placeholder__mono">BG</span>
                            @endif
                        </div>
                    @endif
                </div>
                @if(!empty($offer['badge']))
                <div class="special-badge-stack">
                    <span class="special-badge">{{ $offer['badge'] }}</span>
                </div>
                @endif
                <div class="product-body">
                    <div class="product-name" style="font-size: 0.95rem; margin-bottom: 0.5rem;">
                        {{ $offer['title'] ?? '' }}
                        @if(!empty($offer['subtitle']))
                            <span style="display: block; font-size: 0.82rem; font-weight: 600; color: #6B5D4F; margin-top: 0.15rem;">{{ $offer['subtitle'] }}</span>
                        @endif
                    </div>
                    @if(isset($offer['effective_price']) && $offer['effective_price'] !== null)
                    <div style="display: flex; align-items: baseline; justify-content: center; flex-wrap: wrap; gap: 0.25rem;">
                        @include('partials.card-price', [
                            'sale' => $offer['effective_price'],
                            'was' => (isset($offer['original_price']) && (float) $offer['original_price'] > (float) $offer['effective_price'])
                                ? $offer['original_price']
                                : null,
                        ])
                    </div>
                    @endif
                    <span class="cat-link" style="display: inline-flex; margin-top: 0.75rem; font-size: 0.8rem;">Order now →</span>
                </div>
            </a>
            @endforeach
        </div>
    </div>
</section>
@elseif($todaysSpecials->count() > 0)
@php
    $homeSpecialsEyebrow = content('home_specials_eyebrow', 'Limited time');
    $homeSpecialsTitle = content('home_specials_title', "Today's Specials");
@endphp
<section class="{{ $sectionClass }}">
    <div class="section-inner">
        <div class="section-header">
            <span class="section-eyebrow">{{ $homeSpecialsEyebrow }}</span>
            <h2 class="section-title">{{ $homeSpecialsTitle }}</h2>
            <p class="section-sub">Deals running right now — order before they're gone.</p>
        </div>
        <div class="specials-scroll">
            @foreach($todaysSpecials as $sp)
            <a href="/order/menu" class="special-card">
                <div class="product-img product-img--circle">
                    @if(!empty($sp['item_image']))
                        <img src="{{ $sp['item_image'] }}" alt="{{ $sp['item_name'] ?? '' }}">
                    @elseif(!empty($defaultItemImage))
                        <img src="{{ $defaultItemImage }}" alt="{{ $sp['item_name'] ?? '' }}" data-default-item-image="1">
                    @else
                        @php $brandLogo = content('logo'); @endphp
                        <div class="product-img-placeholder product-img-placeholder--brand" aria-hidden="true">
                            @if($brandLogo)
                                <img src="{{ $brandLogo }}" alt="" class="product-img-placeholder__logo">
                            @else
                                <span class="product-img-placeholder__mono">BG</span>
                            @endif
                        </div>
                    @endif
                </div>
                @php
                    $badgeLabel = $sp['badge_label'] ?? null;
                    $discountPct = isset($sp['discount_pct']) ? (int) $sp['discount_pct'] : null;
                    $showPctUnderBadge = $badgeLabel && $discountPct && $discountPct > 0
                        && !str_contains($badgeLabel, (string) $discountPct . '%');
                @endphp
                @if($badgeLabel || ($discountPct && $discountPct > 0))
                <div class="special-badge-stack">
                    @if($badgeLabel)
                        <span class="special-badge">{{ $badgeLabel }}</span>
                    @endif
                    @if($showPctUnderBadge)
                        <span class="special-badge">{{ $discountPct }}% OFF</span>
                    @elseif(!$badgeLabel && $discountPct && $discountPct > 0)
                        <span class="special-badge">{{ $discountPct }}% OFF</span>
                    @endif
                </div>
                @endif
                <div class="product-body">
                    <div class="product-name" style="font-size: 0.95rem; margin-bottom: 0.5rem;">
                        {{ $sp['item_name'] ?? '' }}
                        @if(!empty($sp['variant_name']))
                            <span style="display: block; font-size: 0.82rem; font-weight: 600; color: #6B5D4F; margin-top: 0.15rem;">{{ $sp['variant_name'] }}</span>
                        @endif
                    </div>
                    <div style="display: flex; align-items: baseline; justify-content: center; flex-wrap: wrap; gap: 0.25rem;">
                        @include('partials.card-price', [
                            'sale' => $sp['effective_price'],
                            'was' => (isset($sp['original_price']) && (float) $sp['original_price'] > (float) $sp['effective_price'])
                                ? $sp['original_price']
                                : null,
                        ])
                    </div>
                    <span class="cat-link" style="display: inline-flex; margin-top: 0.75rem; font-size: 0.8rem;">Order now →</span>
                </div>
            </a>
            @endforeach
        </div>
    </div>
</section>
@endif
