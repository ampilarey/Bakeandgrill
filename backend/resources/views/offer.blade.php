@extends('layout')

@php
    $headline = $headline ?? 'Offer';
    $offerActive = $offerActive ?? false;
    $canonical = url($canonicalPath ?? '/menu');
    $socialImage = $socialImage ?? ['url' => '', 'alt' => $headline];
    $pageDesc = $offerActive
        ? ($headline . ' at Bake & Grill. Prices in MVR.')
        : ($headline . ' — this offer has ended. See today’s menu at Bake & Grill.');
    $currentOffers = $currentOffers ?? [];
    $photo = $photo ?? null;
    $photoUrl = $photo['url'] ?? null;
    $photoWebp = $photo['webp'] ?? null;
    // The stand-in logo must not be cropped into the hero — see menu-item.
    $photoIsPlaceholder = (bool) ($photo['placeholder'] ?? false);
@endphp

@section('title', $headline . ' – Offers – Bake & Grill')
@section('description', $pageDesc)
@section('og_image', $socialImage['url'])
@section('og_image_alt', $socialImage['alt'])
@if(!empty($socialImage['width']) && !empty($socialImage['height']))
@section('og_image_width', $socialImage['width'])
@section('og_image_height', $socialImage['height'])
@endif
@section('og_url', $canonical)
@section('twitter_image', $socialImage['url'])

@section('styles')
<style>
/* Laid out like /menu/{id}, which is itself sized to the order app's item
   sheet. A customer following a shared offer link and a customer following a
   shared item link were landing on two different-looking pages for the same
   dish; the offer page was the one still on the old 560px layout with a
   split action row. Owner, 2026-09-01. */
.offer-page { max-width: 480px; margin: 0 auto; padding: 1.25rem 1.25rem 4rem; }
.offer-topbar {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; margin-bottom: 0.35rem;
}
.offer-back {
    display: inline-flex; align-items: center; gap: 6px;
    min-height: 44px;
    font-size: 0.95rem; font-weight: 700; color: var(--amber); text-decoration: none;
}
.offer-back:hover { text-decoration: underline; }
.offer-topbar .share-control-btn {
    min-height: 44px; padding: 0.5rem 1rem;
    font-size: 0.95rem; font-weight: 700;
}
/* The shared partial opens its popover upward and left-aligned, which suits a
   control at the foot of a page. From the top-right corner that would run off
   the top of the viewport and off the right edge, so flip it. */
.offer-topbar .share-popover {
    top: calc(100% + 0.4rem); bottom: auto;
    left: auto; right: 0;
    max-width: min(20rem, calc(100vw - 2.5rem));
}
.offer-hero {
    position: relative;
    aspect-ratio: 16 / 10;
    border-radius: 16px;
    overflow: hidden;
    background: var(--amber-light);
    display: flex; align-items: center; justify-content: center;
    font-size: 2.75rem;
    margin-bottom: 1.15rem;
}
/* <picture> is an inline wrapper with no size of its own — without this the
   img sizes against a shrink-to-fit box and object-fit has nothing to cover. */
.offer-hero picture { display: block; width: 100%; height: 100%; }
.offer-hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
.offer-hero--placeholder { background: var(--menu-placeholder-bg, #000); }
.offer-hero--placeholder img { object-fit: contain; padding: 4%; box-sizing: border-box; }
/* The badge sits on the picture, the way a discount ribbon does on a card,
   rather than pushing the title down the page. */
.offer-hero .offer-badge {
    position: absolute; top: 12px; left: 12px; z-index: 1;
    margin: 0;
}
.offer-badge {
    display: inline-block; margin-bottom: 0.5rem;
    font-size: 0.75rem; font-weight: 800; letter-spacing: 0.03em; text-transform: uppercase;
    color: #fff; background: var(--amber);
    padding: 0.28rem 0.6rem; border-radius: 999px;
    box-shadow: 0 1px 5px rgba(28,20,8,0.18);
}
.offer-page h1 {
    margin: 0 0 0.2rem;
    font-size: 1.35rem; font-weight: 800;
    color: var(--dark); line-height: 1.25;
}
.offer-ended {
    margin: 0 0 1rem; padding: 0.75rem 0.9rem;
    background: var(--amber-light); border: 1px solid var(--border); border-radius: 12px;
}
.offer-ended p { margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--dark); }
.offer-price {
    display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.45rem;
    margin: 0 0 0.85rem;
    font-size: 1.15rem; font-weight: 800; color: var(--amber);
}
.offer-from { font-size: 0.8rem; font-weight: 600; }
.offer-was {
    font-size: 0.85rem; font-weight: 500; text-decoration: line-through; color: var(--muted);
}
.offer-desc {
    margin: 0 0 1rem;
    font-size: 0.95rem; line-height: 1.55; color: var(--muted); white-space: pre-line;
}
/* One full-width primary action with the secondary beneath, matching the
   sheet — not two buttons splitting a row. */
.offer-actions { display: flex; flex-direction: column; gap: 0.6rem; margin-top: 1.5rem; }
.offer-actions .btn-primary,
.offer-actions .btn-outline { width: 100%; border-radius: 14px; font-weight: 800; }
.offer-more { margin: 1.25rem 0 0; }
.offer-more h2 { margin: 0 0 0.6rem; font-size: 1rem; }
.offer-more ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
.offer-more a { color: var(--amber); font-weight: 600; text-decoration: none; }
@media (max-width: 768px) {
    .offer-page { padding: 1rem 1rem 5rem; }
}
</style>
@endsection

@section('content')
<article class="offer-page" data-testid="offer-page" data-offer-active="{{ $offerActive ? '1' : '0' }}">
    <div class="offer-topbar">
        <a class="offer-back" href="/menu">← Full menu</a>
        @include('partials.share-control', [
            'shareUrl' => $canonical,
            'shareTitle' => $headline,
            'shareText' => $headline . ' at Bake & Grill',
            'shareButtonClass' => 'btn-outline share-control-btn',
        ])
    </div>

    <div class="offer-hero{{ $photoIsPlaceholder ? ' offer-hero--placeholder' : '' }}">
        @if($photoUrl)
            <picture>
                @if($photoWebp)<source srcset="{{ $photoWebp }}" type="image/webp">@endif
                <img src="{{ $photoUrl }}" alt="{{ $socialImage['alt'] ?? $headline }}" loading="eager" decoding="async">
            </picture>
        @else
            <span aria-hidden="true">🍽</span>
        @endif
        @if(!empty($badge))
            <span class="offer-badge">{{ $badge }}</span>
        @endif
    </div>

    <h1>{{ $headline }}</h1>

    @if($price)
        <p class="offer-price">
            @if($price['from'])<span class="offer-from">From</span>@endif
            <span>MVR {{ number_format($price['price'], 2) }}</span>
            @if($price['was'] !== null)
                <s class="offer-was">MVR {{ number_format($price['was'], 2) }}</s>
            @endif
        </p>
    @endif

    @if(! $offerActive)
        <div class="offer-ended" data-testid="offer-ended">
            <p>{{ $endedLabel ?? 'This offer has ended' }}</p>
        </div>
    @endif

    @if(!empty($description))
        <p class="offer-desc">{{ $description }}</p>
    @endif

    <div class="offer-actions">
        @if($item && $offerActive && ! $item->trashed() && $item->is_active && $item->is_available)
            <a href="{{ $addToOrderHref }}" class="btn-primary">Add to order</a>
        @endif
        <a href="/menu" class="btn-outline">Today’s menu</a>
    </div>

    @if(! $offerActive && is_array($currentOffers) && $currentOffers !== [])
        <div class="offer-more">
            <h2>Current offers</h2>
            <ul>
                @foreach($currentOffers as $row)
                    <li>
                        <a href="{{ \App\Support\PublicOfferUrl::fromFeedRow($row) }}">{{ $row['title'] ?? 'Offer' }}</a>
                    </li>
                @endforeach
            </ul>
        </div>
    @endif
</article>
@endsection
