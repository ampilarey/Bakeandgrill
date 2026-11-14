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
<meta name="robots" content="noindex">
<style>
.bx-hero { background: linear-gradient(160deg, var(--amber-light) 0%, var(--bg) 60%); border-bottom: 1px solid var(--border); padding: 2.5rem 1.25rem 2rem; text-align: center; }
.bx-eyebrow { display: inline-block; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--amber); margin-bottom: 0.6rem; }
.bx-hero h1 { font-size: 1.6rem; font-weight: 800; letter-spacing: -0.04em; color: var(--dark); margin: 0 0 0.3rem; }
.bx-hero p { font-size: 0.95rem; color: var(--muted); max-width: 32rem; margin: 0 auto; }
.bx-wrap { max-width: 560px; margin: 0 auto; padding: 1.5rem 1rem 4rem; box-sizing: border-box; }
.bx-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 1.1rem 1.25rem; margin-bottom: 1rem; }
.bx-rows { margin: 0; padding: 0; list-style: none; }
.bx-rows li { display: flex; justify-content: space-between; gap: 1rem; padding: 0.55rem 0; border-top: 1px solid var(--border); font-size: 0.95rem; }
.bx-rows li:first-child { border-top: 0; }
.bx-rows li span { color: var(--muted); }
.bx-rows li span small { display: block; font-size: 0.75rem; }
.bx-rows li b { color: var(--dark); text-align: right; font-weight: 600; flex-shrink: 0; }
.bx-h { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--amber); margin: 0 0 0.4rem; }
.bx-storage { background: var(--amber); color: #fff; border-radius: 10px; padding: 0.6rem 0.85rem; font-weight: 700; font-size: 0.82rem; text-align: center; margin-bottom: 1rem; }
.bx-btn { display: flex; align-items: center; justify-content: center; min-height: 50px; border-radius: 12px; font-weight: 700; font-size: 1rem; text-decoration: none; background: var(--amber); color: #fff; }
.bx-foot { font-size: 0.8rem; color: var(--muted); text-align: center; margin-top: 1rem; }
.bx-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.08em; }
@media (min-width: 601px) {
  .bx-hero h1 { font-size: 2rem; }
}
</style>
@endsection

@section('content')
<div class="bx-hero">
    <span class="bx-eyebrow">Box details{{ $boxNo !== '' ? ' · ' . $boxNo : '' }}</span>
    <h1 data-testid="box-customer">{{ $box['customer'] !== '' ? $box['customer'] : 'A box from ' . $siteName }}</h1>
    <p>Scanned from a {{ $siteName }} box label. What it says, in full.</p>
</div>

<div class="bx-wrap">
    @if ($box['storage'] !== '')
        <div class="bx-storage">{{ $box['storage'] }}</div>
    @endif
    <div class="bx-card">
        <ul class="bx-rows">
            @if ($box['when'] !== '')<li><span>Delivery</span><b>{{ $box['when'] }}</b></li>@endif
            @if ($box['boat'] !== '')<li><span>Boat</span><b>{{ $box['boat'] }}</b></li>@endif
            @if ($box['pickup'] !== '')<li><span>Pick-up point</span><b>{{ $box['pickup'] }}</b></li>@endif
            @if ($box['po'] !== '')<li><span>PO number</span><b>{{ $box['po'] }}</b></li>@endif
            @if ($boxNo !== '')<li><span>Box</span><b>{{ $box['box'] }}{{ $box['of'] !== '' ? ' of ' . $box['of'] : '' }}</b></li>@endif
            <li><span>Box code</span><b class="bx-code">{{ $code }}</b></li>
            <li><span>Label printed on</span><b>{{ $box['printed'] ?? '—' }}</b></li>
        </ul>
    </div>

    <div class="bx-card" data-testid="box-contents">
        <p class="bx-h">Contents</p>
        @if ($box['lines'] === [])
            <p style="margin: 0; color: var(--muted);">The contents were written on the label by hand.</p>
        @else
            <ul class="bx-rows">
                @foreach ($box['lines'] as $line)
                    <li><span>{{ $line['name'] }}@if ($line['article'] !== '')<small>{{ $line['article'] }}</small>@endif</span><b>{{ $line['qty'] > 0 ? $line['qty'] . ' pcs' : 'see label' }}</b></li>
                @endforeach
                @if ($box['total'] > 0)
                    <li><span><strong>Total</strong></span><b>{{ $box['total'] }} pcs</b></li>
                @endif
            </ul>
        @endif
    </div>

    <a class="bx-btn" href="{{ $complainUrl }}">Something wrong with this box? Tell us</a>
    <p class="bx-foot">{{ $siteName }} · code <span class="bx-code">{{ $code }}</span></p>
</div>
@endsection
