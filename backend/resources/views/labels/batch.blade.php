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
<meta name="robots" content="noindex">
<style>
.bp-hero { background: linear-gradient(160deg, var(--amber-light) 0%, var(--bg) 60%); border-bottom: 1px solid var(--border); padding: 2.5rem 1.25rem 2rem; text-align: center; }
.bp-eyebrow { display: inline-block; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--amber); margin-bottom: 0.6rem; }
.bp-hero h1 { font-size: 2rem; font-weight: 800; letter-spacing: -0.04em; color: var(--dark); margin: 0 0 0.3rem; }
.bp-hero .bp-dv { font-size: 1.25rem; color: var(--muted); direction: rtl; margin: 0 0 0.5rem; }
.bp-hero p { font-size: 0.95rem; color: var(--muted); max-width: 32rem; margin: 0 auto; }
.bp-hero h1 { font-size: 1.6rem; } 
@media (min-width: 601px) {
  .bp-hero h1 { font-size: 2rem; }
}
.bp-wrap { max-width: 560px; margin: 0 auto; padding: 1.5rem 1rem 4rem; box-sizing: border-box; }
.bp-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 1.1rem 1.25rem; margin-bottom: 1rem; }
.bp-status { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.9rem; border-radius: 999px; font-weight: 700; font-size: 0.95rem; margin-top: 0.75rem; }
.bp-status.fresh { background: #e6f4ea; color: #1e6b36; }
.bp-status.soon, .bp-status.today { background: #fdf1dc; color: #8a5a00; }
.bp-status.expired { background: #fde8e8; color: #9b1c1c; }
.bp-dates { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.bp-date { border: 1.5px solid var(--border); border-radius: 12px; padding: 0.7rem 0.85rem; }
.bp-date.exp { border-color: var(--amber); }
.bp-date span { display: block; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
.bp-date strong { display: block; font-size: 1.25rem; color: var(--dark); margin-top: 0.15rem; }
.bp-rows { margin: 0; padding: 0; list-style: none; }
.bp-rows li { display: flex; justify-content: space-between; gap: 1rem; padding: 0.55rem 0; border-top: 1px solid var(--border); font-size: 0.95rem; }
.bp-rows li:first-child { border-top: 0; }
.bp-rows li span { color: var(--muted); flex-shrink: 0; }
.bp-rows li b { color: var(--dark); text-align: right; font-weight: 600; }
.bp-h { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--amber); margin: 0 0 0.4rem; }
.bp-text { margin: 0; color: var(--text); line-height: 1.5; }
.bp-text strong { color: var(--dark); }
.bp-text + .bp-text { margin-top: 0.3rem; }
.bp-dvline { direction: rtl; color: var(--muted); font-size: 1.05rem; }
.bp-icons { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 0.5rem 0 0.75rem; }
.bp-icon { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; width: 64px; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.04em; color: var(--dark); text-align: center; }
.bp-storage { background: var(--amber); color: #fff; border-radius: 10px; padding: 0.6rem 0.85rem; font-weight: 700; font-size: 0.82rem; letter-spacing: 0.02em; text-align: center; }
.bp-storage .bp-dvline { color: #fff; margin-top: 0.25rem; }
.bp-actions { display: grid; gap: 0.6rem; margin-top: 0.5rem; }
.bp-btn { display: flex; align-items: center; justify-content: center; min-height: 50px; border-radius: 12px; font-weight: 700; font-size: 1rem; text-decoration: none; }
.bp-btn.primary { background: var(--amber); color: #fff; }
.bp-btn.secondary { border: 1.5px solid var(--border); color: var(--dark); background: var(--surface); }
.bp-foot { font-size: 0.8rem; color: var(--muted); text-align: center; margin-top: 1rem; }
.bp-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.08em; }
</style>
@endsection

@section('content')
@if ($pack === null)
<div class="bp-hero">
    <span class="bp-eyebrow">Pack details</span>
    <h1>We could not find this pack</h1>
    <p>The code <span class="bp-code">{{ $code }}</span> on this sticker is not in our records. It may be from a preview sheet, or typed wrongly.</p>
</div>
<div class="bp-wrap" data-testid="batch-not-found">
    <div class="bp-actions">
        <a class="bp-btn primary" href="{{ $complainUrl }}">Something wrong with this pack? Tell us</a>
        <a class="bp-btn secondary" href="{{ $menuUrl }}">See the menu</a>
    </div>
</div>
@else
<div class="bp-hero">
    <span class="bp-eyebrow">{{ $pack['gone'] ? 'Pack details' : $pack['brand'] . ' · ' . $pack['heading'] }}</span>
    <h1 data-testid="batch-name">{{ $pack['name'] }}</h1>
    @if ($pack['name_dv'] !== '')
        <p class="bp-dv">{{ $pack['name_dv'] }}</p>
    @endif
    <p>Scanned from a {{ $siteName }} pack sticker. What it says, in full.</p>
    @if ($statusText !== null)
        <span class="bp-status {{ $status }}" data-testid="batch-status">{{ $statusText }}</span>
    @endif
</div>

<div class="bp-wrap">
    <div class="bp-card">
        <div class="bp-dates">
            <div class="bp-date"><span>Made on</span><strong>{{ $pack['mfg'] ?? '—' }}</strong></div>
            <div class="bp-date exp"><span>Use by</span><strong>{{ $pack['exp'] ?? '—' }}</strong></div>
        </div>
        <ul class="bp-rows" style="margin-top: 0.75rem;">
            <li><span>Batch</span><b>{{ $pack['batch'] !== '' ? $pack['batch'] : 'Not marked' }}</b></li>
            <li><span>Pack code</span><b class="bp-code">{{ $code }}</b></li>
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
            <div class="bp-storage">
                {{ $pack['storage_en'] }}
                @if ($pack['storage_dv'] !== '')<div class="bp-dvline">{{ $pack['storage_dv'] }}</div>@endif
            </div>
        @endif

        @if ($pack['ingredients_en'] !== '' || $pack['ingredients_dv'] !== '')
            <div class="bp-card" style="margin-top: 1rem;">
                <p class="bp-h">Ingredients</p>
                @if ($pack['ingredients_en'] !== '')<p class="bp-text" data-testid="batch-ingredients">{!! $boldAllergens($pack['ingredients_en']) !!}</p>@endif
                @if ($pack['ingredients_dv'] !== '')<p class="bp-text bp-dvline">{{ $pack['ingredients_dv'] }}</p>@endif
                @if ($allergens !== [])
                    <p class="bp-h" style="margin-top: 0.9rem;">Contains</p>
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
            <div class="bp-card" style="margin-top: 1rem;"><p class="bp-text">{{ $pack['note'] }}</p></div>
        @endif

        @if ($pack['how_to_use'] !== '' || $pack['how_to_use_dv'] !== '')
            <div class="bp-card">
                <p class="bp-h">How to use</p>
                @if ($pack['how_to_use'] !== '')<p class="bp-text">{{ $pack['how_to_use'] }}</p>@endif
                @if ($pack['how_to_use_dv'] !== '')<p class="bp-text bp-dvline">{{ $pack['how_to_use_dv'] }}</p>@endif
            </div>
        @endif
    @else
        <div class="bp-card"><p class="bp-text">This product is no longer on our list, so its ingredients are not shown here. The sticker's dates still stand.</p></div>
    @endif

    <div class="bp-actions">
        <a class="bp-btn primary" href="{{ $complainUrl }}" data-testid="batch-complain">Something wrong with this pack? Tell us</a>
        <a class="bp-btn secondary" href="{{ $menuUrl }}">See the menu</a>
    </div>
    <p class="bp-foot">The pack code identifies the sticker, not you. Scanning tells us nothing about who scanned it.</p>
    @if (!$pack['gone'])
        {{-- Scan to reprint (round 11, 2026-10-13): staff who scan a pack with the phone's camera land here; one tap opens Print labels on this very sticker. --}}
        <p class="bp-foot"><a href="{{ url('/admin/labels/stickers?code=' . rawurlencode($code)) }}" data-testid="batch-reprint" style="color: var(--muted); text-decoration: underline;">Staff: print this sticker again</a></p>
    @endif
</div>
@endif
@endsection
