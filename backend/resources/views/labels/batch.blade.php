@extends('layout')

@php
    /*
     * The pack's page (2026-10-12): the batch QR on a sticker opens it.
     * @var ?array<string, mixed> $pack  @var string $code  @var string $siteName  @var string $complainUrl  @var string $menuUrl
     */
    $status = $pack['status'] ?? null;
    $statusText = match ($status) {
        'fresh' => 'Good for ' . $pack['days_left'] . ' more ' . ($pack['days_left'] === 1 ? 'day' : 'days'),
        'soon' => $pack['days_left'] === 1 ? 'Use by tomorrow' : 'Use within ' . $pack['days_left'] . ' days',
        'today' => 'Use today',
        'expired' => 'Past its date' . (abs($pack['days_left']) === 1 ? ' since yesterday' : ' by ' . abs($pack['days_left']) . ' days'),
        default => null,
    };
    $allergens = $pack['allergens'] ?? [];
    $boldAllergens = function (string $text) use ($allergens): string {
        $html = e($text);
        if ($allergens === []) {
            return $html;
        }
        $pattern = '/\b(' . implode('|', array_map(fn ($w) => preg_quote($w, '/'), $allergens)) . ')\b/iu';

        return (string) preg_replace($pattern, '<strong>$1</strong>', $html);
    };
@endphp

@section('title', ($pack['name'] ?? 'Pack not found') . ' – ' . $siteName)
@section('description', $pack ? 'Dates, batch, ingredients and allergens of this ' . $siteName . ' pack.' : 'This pack code is not in our records.')

@section('styles')
@include('labels.partials.page-brand')
<style>
.bp-dates { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 130px), 1fr)); gap: 0.75rem; }
.bp-date { border: 1.5px solid var(--border); border-radius: 12px; padding: 0.7rem 0.85rem; }
.bp-date.exp { border-color: var(--amber); background: var(--amber-light); }
.bp-date span { display: block; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
.bp-date strong { display: block; font-size: 1.15rem; color: var(--dark); margin-top: 0.15rem; white-space: nowrap; }
.bp-text { margin: 0; color: var(--text); line-height: 1.5; }
.bp-text strong { color: var(--dark); }
.bp-text + .bp-text { margin-top: 0.3rem; }
.bp-dvline { direction: rtl; color: var(--muted); font-size: 1.05rem; }
.lp-storage .bp-dvline { color: #fff; margin-top: 0.25rem; }
.bp-icons { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 0.5rem 0 0.75rem; }
.bp-icon { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; width: 64px; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.04em; color: var(--dark); text-align: center; }
</style>
@endsection

@section('content')
@if ($pack === null)
<div class="lp-hero">
    <img class="lp-logo" src="{{ $maker['logo'] }}" alt="{{ $siteName }}">
    <p class="lp-brand">{{ $maker['name'] }}</p>
    <p class="lp-tagline">{{ $maker['tagline'] }}</p>
    <span class="lp-eyebrow">Pack details</span>
    <h1>We could not find this pack</h1>
    <p class="lp-sub">The code <span class="lp-code">{{ $code }}</span> on this sticker is not in our records. It may be from a preview sheet, or typed wrongly.</p>
</div>
<div class="lp-wrap" data-testid="batch-not-found">
    <a class="lp-btn primary" href="{{ $complainUrl }}">Something wrong with this pack? Tell us</a>
    @include('labels.partials.page-maker')
</div>
@else
<div class="lp-hero">
    <img class="lp-logo" src="{{ $maker['logo'] }}" alt="{{ $siteName }}">
    <p class="lp-brand">{{ $maker['name'] }}</p>
    <p class="lp-tagline">{{ $maker['tagline'] }}</p>
    @if (!empty($pack['photo']))
        <div class="lp-photo"><img src="{{ $pack['photo'] }}" alt="{{ $pack['name'] }}" width="148" height="148"></div>
    @endif
    <span class="lp-eyebrow">{{ $pack['gone'] ? 'Pack details' : ($pack['brand'] !== $maker['name'] ? $pack['brand'] . ' · ' : '') . $pack['heading'] }}</span>
    <h1 data-testid="batch-name">{{ $pack['name'] }}</h1>
    @if ($pack['name_dv'] !== '')
        <p class="lp-dv">{{ $pack['name_dv'] }}</p>
    @endif
    <div class="lp-chips">
        @if ($statusText !== null)
            <span class="lp-chip {{ $status }}" data-testid="batch-status">{{ $statusText }}</span>
        @endif
        @if ($pack['price'] !== '')
            <span class="lp-chip price" data-testid="batch-price">{{ $pack['price'] }}</span>
        @endif
        @if ($pack['qty'])
            <span class="lp-chip">{{ $pack['qty'] }} {{ $pack['unit'] }}</span>
        @endif
    </div>
    <p class="lp-sub">Scanned from a {{ $siteName }} pack sticker. What it says, in full.</p>
</div>

<div class="lp-wrap">
    <div class="lp-card">
        <div class="bp-dates">
            <div class="bp-date"><span>Made on</span><strong>{{ $pack['mfg'] ?? '—' }}</strong></div>
            <div class="bp-date exp"><span>Use by</span><strong>{{ $pack['exp'] ?? '—' }}</strong></div>
        </div>
        <ul class="lp-rows" style="margin-top: 0.75rem;">
            <li><span>Batch</span><b>{{ $pack['batch'] !== '' ? $pack['batch'] : 'Not marked' }}</b></li>
            <li><span>Pack code</span><b class="lp-code">{{ $code }}</b></li>
            @if ($pack['qty'])
                <li><span>Pack size</span><b>{{ $pack['qty'] }} {{ $pack['unit'] }}</b></li>
            @endif
            @if (!empty($pack['net_weight']))
                <li><span>Net weight</span><b>{{ $pack['net_weight'] }}</b></li>
            @endif
            @if (!empty($pack['use_within']))
                <li><span>After opening</span><b>{{ $pack['use_within'] }}</b></li>
            @endif
            <li><span>Stickered on</span><b>{{ $pack['printed'] ?? '—' }}</b></li>
        </ul>
    </div>

    @if (!$pack['gone'])
        @if ($pack['storage_en'] !== '' || $pack['storage_dv'] !== '')
            <div class="lp-storage">
                {{ $pack['storage_en'] }}
                @if ($pack['storage_dv'] !== '')<div class="bp-dvline">{{ $pack['storage_dv'] }}</div>@endif
            </div>
        @endif

        @if ($pack['ingredients_en'] !== '' || $pack['ingredients_dv'] !== '')
            <div class="lp-card">
                <p class="lp-h">Ingredients</p>
                @if ($pack['ingredients_en'] !== '')<p class="bp-text" data-testid="batch-ingredients">{!! $boldAllergens($pack['ingredients_en']) !!}</p>@endif
                @if ($pack['ingredients_dv'] !== '')<p class="bp-text bp-dvline">{{ $pack['ingredients_dv'] }}</p>@endif
                @if ($allergens !== [])
                    <p class="lp-h" style="margin-top: 0.9rem;">Contains</p>
                    @if ($pack['icons'] !== [])
                        <div class="bp-icons" data-testid="batch-icons">
                            @foreach ($pack['icons'] as $icon)
                                <div class="bp-icon">{!! $icon['svg'] !!}<span>{{ $icon['caption'] }}</span></div>
                            @endforeach
                        </div>
                    @endif
                    <p class="bp-text"><strong>{{ implode(', ', $allergens) }}</strong></p>
                @endif
                @if ($pack['note'] !== '')<p class="bp-text" style="margin-top: 0.6rem; color: var(--muted);">{{ $pack['note'] }}</p>@endif
            </div>
        @elseif ($pack['note'] !== '')
            <div class="lp-card"><p class="bp-text">{{ $pack['note'] }}</p></div>
        @endif

        @if ($pack['how_to_use'] !== '' || $pack['how_to_use_dv'] !== '')
            <div class="lp-card">
                <p class="lp-h">How to use</p>
                @if ($pack['how_to_use'] !== '')<p class="bp-text">{{ $pack['how_to_use'] }}</p>@endif
                @if ($pack['how_to_use_dv'] !== '')<p class="bp-text bp-dvline">{{ $pack['how_to_use_dv'] }}</p>@endif
            </div>
        @endif
    @else
        <div class="lp-card"><p class="bp-text">This product is no longer on our list, so its ingredients are not shown here. The sticker's dates still stand.</p></div>
    @endif

    <a class="lp-btn primary" href="{{ $complainUrl }}" data-testid="batch-complain">Something wrong with this pack? Tell us</a>
    @include('labels.partials.page-maker')
    <p class="lp-foot">The pack code identifies the sticker, not you. Scanning tells us nothing about who scanned it.</p>
    @if (!$pack['gone'])
        {{-- Scan to reprint (round 11, 2026-10-13): staff who scan a pack with the phone's camera land here; one tap opens Print labels on this very sticker. --}}
        <p class="lp-foot"><a href="{{ url('/admin/labels/stickers?code=' . rawurlencode($code)) }}" data-testid="batch-reprint" style="color: var(--muted); text-decoration: underline;">Staff: print this sticker again</a></p>
    @endif
</div>
@endif
@endsection
