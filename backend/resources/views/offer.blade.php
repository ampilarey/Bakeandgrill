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
@endphp

@section('title', $headline . ' – Offers – Bake & Grill')
@section('description', $pageDesc)
@section('og_image', $socialImage['url'])
@section('og_image_alt', $socialImage['alt'])
@section('og_url', $canonical)
@section('twitter_image', $socialImage['url'])

@section('styles')
<style>
.offer-page { max-width: 560px; margin: 0 auto; padding: 1.25rem 1.25rem 4rem; }
.offer-back { display: inline-block; margin-bottom: 1rem; font-size: 0.875rem; font-weight: 600; color: var(--amber); text-decoration: none; }
.offer-badge { display: inline-block; margin-bottom: 0.5rem; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.03em; text-transform: uppercase; color: #fff; background: var(--amber); padding: 0.25rem 0.55rem; border-radius: 999px; }
.offer-page h1 { margin: 0 0 0.5rem; font-size: 1.6rem; font-weight: 800; letter-spacing: -0.03em; color: var(--dark); }
.offer-ended { margin: 0 0 1rem; padding: 0.75rem 0.9rem; background: var(--amber-light); border: 1px solid var(--border); border-radius: 12px; font-weight: 700; }
.offer-price { margin: 0 0 1rem; font-size: 1.15rem; font-weight: 800; color: var(--amber); }
.offer-was { font-size: 0.85rem; font-weight: 500; text-decoration: line-through; color: var(--muted); }
.offer-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.25rem; }
.offer-actions .btn-primary, .offer-actions .btn-outline { flex: 1 1 11rem; }
.offer-more { margin-top: 1.5rem; }
.offer-more h2 { margin: 0 0 0.6rem; font-size: 1rem; }
.offer-more ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
.offer-more a { color: var(--amber); font-weight: 600; text-decoration: none; }
</style>
@endsection

@section('content')
<article class="offer-page" data-testid="offer-page" data-offer-active="{{ $offerActive ? '1' : '0' }}">
    <a class="offer-back" href="/menu">← Full menu</a>
    @if(!empty($badge))
        <span class="offer-badge">{{ $badge }}</span>
    @endif
    <h1>{{ $headline }}</h1>

    @if(! $offerActive)
        <p class="offer-ended" data-testid="offer-ended">{{ $endedLabel ?? 'This offer has ended' }}</p>
    @endif

    @if($price)
        <p class="offer-price">
            @if($price['from'])<span>From </span>@endif
            MVR {{ number_format($price['price'], 2) }}
            @if($price['was'] !== null)
                <s class="offer-was">MVR {{ number_format($price['was'], 2) }}</s>
            @endif
        </p>
    @endif

    @if(!empty($description))
        <p>{{ $description }}</p>
    @endif

    <div class="offer-actions">
        @if($item && $offerActive && ! $item->trashed() && $item->is_active && $item->is_available)
            <a href="{{ $addToOrderHref }}" class="btn-primary">Add to order</a>
        @endif
        <a href="/menu" class="btn-outline">Today’s menu</a>
        @include('partials.share-control', [
            'shareUrl' => $canonical,
            'shareTitle' => $headline,
            'shareText' => $headline . ' at Bake & Grill',
            'shareButtonClass' => 'btn-outline',
        ])
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
