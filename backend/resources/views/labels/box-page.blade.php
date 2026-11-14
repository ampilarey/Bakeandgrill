@extends('layout')

@php
    /*
     * A box label's page (owner, 2026-11-14): the code on a box label opens it. Who the box is for, when it
     * travels and what it holds, as the label printed it.
     * @var array<string, mixed> $box  @var string $code  @var string $siteName  @var string $complainUrl  @var string $menuUrl
     */
    $boxNo = $box['box'] !== '' ? 'Box ' . $box['box'] . ($box['of'] !== '' ? ' of ' . $box['of'] : '') : '';
@endphp

@section('title', ($box['customer'] !== '' ? 'Box for ' . $box['customer'] : 'Box details') . ' – ' . $siteName)
@section('description', 'What this ' . $siteName . ' box holds.')

@section('styles')
@include('labels.partials.page-brand')
@endsection

@section('content')
<div class="lp-hero">
    <img class="lp-logo" src="{{ $maker['logo'] }}" alt="{{ $siteName }}">
    <p class="lp-brand">{{ $maker['name'] }}</p>
    <p class="lp-tagline">{{ $maker['tagline'] }}</p>
    <span class="lp-eyebrow">Box details{{ $boxNo !== '' ? ' · ' . $boxNo : '' }}</span>
    <h1 data-testid="box-customer">{{ $box['customer'] !== '' ? $box['customer'] : 'A box from ' . $siteName }}</h1>
    <div class="lp-chips">
        @if ($box['total'] > 0)<span class="lp-chip price">{{ $box['total'] }} pcs</span>@endif
        @if ($box['when'] !== '')<span class="lp-chip">{{ $box['when'] }}</span>@endif
    </div>
    <p class="lp-sub">Scanned from a {{ $siteName }} box label. What it says, in full.</p>
</div>

<div class="lp-wrap">
    @if ($box['storage'] !== '')
        <div class="lp-storage">{{ $box['storage'] }}</div>
    @endif
    <div class="lp-card">
        <ul class="lp-rows">
            @if ($box['when'] !== '')<li><span>Delivery</span><b>{{ $box['when'] }}</b></li>@endif
            @if ($box['boat'] !== '')<li><span>Boat</span><b>{{ $box['boat'] }}</b></li>@endif
            @if ($box['pickup'] !== '')<li><span>Pick-up point</span><b>{{ $box['pickup'] }}</b></li>@endif
            @if ($box['po'] !== '')<li><span>PO number</span><b>{{ $box['po'] }}</b></li>@endif
            @if ($boxNo !== '')<li><span>Box</span><b>{{ $box['box'] }}{{ $box['of'] !== '' ? ' of ' . $box['of'] : '' }}</b></li>@endif
            <li><span>Box code</span><b class="lp-code">{{ $code }}</b></li>
            <li><span>Label printed on</span><b>{{ $box['printed'] ?? '—' }}</b></li>
        </ul>
    </div>

    <div class="lp-card" data-testid="box-contents">
        <p class="lp-h">Contents</p>
        @if ($box['lines'] === [])
            <p style="margin: 0; color: var(--muted);">The contents were written on the label by hand.</p>
        @else
            <ul class="lp-rows">
                @foreach ($box['lines'] as $line)
                    <li><span>{{ $line['name'] }}@if ($line['article'] !== '')<small>{{ $line['article'] }}</small>@endif</span><b>{{ $line['qty'] > 0 ? $line['qty'] . ' pcs' : 'see label' }}</b></li>
                @endforeach
                @if ($box['total'] > 0)
                    <li><span><strong>Total</strong></span><b>{{ $box['total'] }} pcs</b></li>
                @endif
            </ul>
        @endif
    </div>

    <a class="lp-btn primary" href="{{ $complainUrl }}">Something wrong with this box? Tell us</a>
    @include('labels.partials.page-maker')
    <p class="lp-foot">{{ $siteName }} · code <span class="lp-code">{{ $code }}</span></p>
</div>
@endsection
