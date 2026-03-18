@php
    $logoUrl  = \App\Models\SiteSetting::get('logo',      asset('logo.png'));
    $siteName = \App\Models\SiteSetting::get('site_name', 'Bake & Grill');
@endphp
<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Accurate daily prayer times for all islands of Maldives.">
    <title>Prayer Times — {{ $siteName }}</title>
    <link rel="icon" type="image/png" href="{{ \App\Models\SiteSetting::get('favicon', asset('logo.png')) }}">

    {{-- Dhivehi font --}}
    <style>
        @font-face {
            font-family: 'A_Faruma';
            src: url('/fonts/a_faruma.ttf') format('truetype');
            font-weight: 400;
            font-style: normal;
            font-display: swap;
        }
    </style>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">

    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
            --amber:        #D4813A;
            --amber-hover:  #B86820;
            --amber-light:  #FEF3E8;
            --amber-glow:   rgba(212, 129, 58, 0.18);
            --dark:         #1C1408;
            --surface:      #FFFFFF;
            --bg:           #FFFDF9;
            --border:       #EDE4D4;
            --border-strong:#C4A87A;
            --text:         #2A1E0C;
            --muted:        #8B7355;
            --next-bg:      rgba(212, 129, 58, 0.06);
            --next-border:  rgba(212, 129, 58, 0.28);

            --radius:    16px;
            --radius-sm: 10px;
            --radius-xs: 6px;

            --font-ui:     'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            --font-dhivehi: 'A_Faruma', 'MV Faseyha', 'MV Waheed', serif;
        }

        html { font-size: 16px; scroll-behavior: smooth; }

        body {
            background: var(--bg);
            color: var(--text);
            font-family: var(--font-ui);
            min-height: 100vh;
            line-height: 1.6;
            -webkit-font-smoothing: antialiased;
        }

        a { text-decoration: none; color: inherit; }

        .container { max-width: 1060px; margin: 0 auto; padding: 0 1.5rem; }

        /* ═══ Header ═══════════════════════════════════════════════════════ */
        .pt-header {
            position: sticky;
            top: 0;
            z-index: 300;
            background: rgba(255, 253, 249, 0.93);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border-bottom: 1px solid var(--border);
            box-shadow: 0 1px 0 var(--border);
            transition: box-shadow 0.2s;
        }
        .pt-header.scrolled { box-shadow: 0 4px 24px rgba(28,20,8,0.08); }

        .pt-header-inner {
            max-width: 1060px;
            margin: 0 auto;
            padding: 0 1.5rem;
            height: 64px;
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        .pt-logo {
            display: flex;
            align-items: center;
            gap: 0.55rem;
            font-size: 1.1rem;
            font-weight: 800;
            color: var(--dark);
            letter-spacing: -0.02em;
            flex-shrink: 0;
            text-decoration: none;
        }
        .pt-logo img { width: 34px; height: 34px; border-radius: 8px; }

        .pt-page-title {
            flex: 1;
            font-size: 0.9rem;
            font-weight: 600;
            color: var(--muted);
            letter-spacing: 0.01em;
        }

        .pt-back-btn {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            padding: 0.45rem 1rem;
            border: 1.5px solid var(--border);
            border-radius: 8px;
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--muted);
            background: var(--surface);
            flex-shrink: 0;
            transition: all 0.15s;
            text-decoration: none;
        }
        .pt-back-btn:hover {
            border-color: var(--amber);
            color: var(--amber);
            background: var(--amber-light);
        }

        /* ═══ Page layout ═══════════════════════════════════════════════════ */
        .pt-page { padding: 2rem 0 5rem; }

        /* ─── Controls card ─── */
        .pt-controls {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 1.5rem;
            display: flex;
            flex-wrap: wrap;
            gap: 1rem;
            align-items: flex-end;
            margin-bottom: 2rem;
            box-shadow: 0 2px 12px rgba(28,20,8,0.04);
        }

        .pt-field      { flex: 1 1 240px; }
        .pt-field-date { flex: 0 0 180px; }
        .pt-field-geo  { flex: 0 0 auto; align-self: flex-end; }

        .pt-label {
            display: block;
            font-size: 0.72rem;
            font-weight: 700;
            color: var(--muted);
            margin-bottom: 0.45rem;
            letter-spacing: 0.06em;
            text-transform: uppercase;
        }

        /* ─── Island dropdown ─── */
        .isl-dropdown { position: relative; width: 100%; }

        .isl-trigger {
            width: 100%;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: var(--bg);
            border: 1.5px solid var(--border);
            border-radius: var(--radius-sm);
            padding: 0.65rem 1rem;
            font-family: var(--font-dhivehi);
            font-size: 1rem;
            color: var(--text);
            cursor: pointer;
            text-align: right;
            direction: rtl;
            transition: border-color 0.2s, box-shadow 0.2s;
        }
        .isl-trigger:hover,
        .isl-trigger.open {
            border-color: var(--amber);
            box-shadow: 0 0 0 3px var(--amber-glow);
        }

        .isl-trigger-dv  { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .isl-trigger-latin {
            font-family: var(--font-ui);
            font-size: 0.8rem;
            color: var(--muted);
            white-space: nowrap;
            flex-shrink: 0;
        }
        .isl-arrow {
            font-size: 0.6rem;
            color: var(--muted);
            flex-shrink: 0;
            transition: transform 0.2s;
            margin-inline-end: 2px;
        }
        .isl-trigger.open .isl-arrow { transform: rotate(180deg); }

        .isl-panel {
            position: absolute;
            top: calc(100% + 4px);
            left: 0; right: 0;
            background: var(--surface);
            border: 1.5px solid var(--amber);
            border-radius: var(--radius-sm);
            z-index: 1000;
            display: none;
            flex-direction: column;
            max-height: 360px;
            box-shadow: 0 12px 40px rgba(28,20,8,0.12);
        }
        .isl-panel.open { display: flex; }

        .isl-search {
            padding: 0.6rem 0.75rem;
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
        }
        .isl-search input {
            width: 100%;
            background: var(--bg);
            color: var(--text);
            border: 1px solid var(--border);
            border-radius: var(--radius-xs);
            padding: 0.45rem 0.7rem;
            font-family: var(--font-ui);
            font-size: 0.9rem;
            outline: none;
            direction: ltr;
            transition: border-color 0.2s;
        }
        .isl-search input:focus { border-color: var(--amber); }

        .isl-list { overflow-y: auto; flex: 1; }

        .isl-group-label {
            padding: 0.5rem 0.9rem 0.3rem;
            font-family: var(--font-ui);
            font-size: 0.68rem;
            font-weight: 700;
            color: var(--amber);
            letter-spacing: 0.07em;
            text-transform: uppercase;
            background: var(--surface);
            position: sticky;
            top: 0;
            border-bottom: 1px solid var(--border);
            direction: ltr;
            display: flex;
            align-items: center;
            gap: 0.4rem;
        }
        .isl-group-label-lat { color: var(--muted); font-weight: 400; }

        .isl-option {
            padding: 0.5rem 1rem;
            cursor: pointer;
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 0.5rem;
            direction: rtl;
            transition: background 0.1s;
        }
        .isl-option:hover,
        .isl-option.active { background: var(--amber-light); }
        .isl-option.selected .isl-opt-dv { color: var(--amber); font-weight: 600; }

        .isl-opt-dv  { font-family: var(--font-dhivehi); font-size: 0.96rem; }
        .isl-opt-lat { font-family: var(--font-ui); font-size: 0.78rem; color: var(--muted); white-space: nowrap; }
        .isl-no-results {
            padding: 1.25rem;
            text-align: center;
            color: var(--muted);
            font-size: 0.88rem;
            direction: ltr;
        }

        /* ─── Date picker ─── */
        .date-picker-wrap { position: relative; width: 100%; }

        .date-display {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: var(--bg);
            border: 1.5px solid var(--border);
            border-radius: var(--radius-sm);
            padding: 0.65rem 1rem;
            font-family: var(--font-ui);
            font-size: 0.95rem;
            color: var(--text);
            width: 100%;
            white-space: nowrap;
            direction: ltr;
            pointer-events: none;
            user-select: none;
        }

        .date-picker-wrap:hover .date-display,
        .date-picker-wrap:focus-within .date-display {
            border-color: var(--amber);
            box-shadow: 0 0 0 3px var(--amber-glow);
        }

        .date-icon { width: 15px; height: 15px; color: var(--amber); flex-shrink: 0; }

        #ptDate {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            opacity: 0;
            cursor: pointer;
            -webkit-appearance: none;
            appearance: none;
            border: none;
            background: transparent;
            font-size: 16px;
        }

        /* ─── Geo button ─── */
        .pt-geo-btn {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.65rem 1.1rem;
            background: transparent;
            border: 1.5px solid var(--border);
            border-radius: var(--radius-sm);
            color: var(--muted);
            font-family: var(--font-ui);
            font-size: 0.88rem;
            font-weight: 600;
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.15s;
        }
        .pt-geo-btn:hover {
            border-color: var(--amber);
            color: var(--amber);
            background: var(--amber-light);
        }
        .pt-geo-btn svg { width: 15px; height: 15px; flex-shrink: 0; }

        /* ─── Geo toast ─── */
        .pt-geo-toast {
            display: none;
            margin-top: 0.5rem;
            padding: 0.5rem 0.85rem;
            border-radius: var(--radius-xs);
            font-size: 0.85rem;
            direction: ltr;
            background: #FEF3C7;
            color: #92400E;
            border: 1px solid #FCD34D;
        }
        .pt-geo-toast.error { background: #FEE2E2; color: #991B1B; border-color: #FCA5A5; }

        /* ═══ Context strip ════════════════════════════════════════════════ */
        .pt-context {
            text-align: center;
            margin-bottom: 2rem;
            padding: 1.75rem 1rem;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            box-shadow: 0 2px 12px rgba(28,20,8,0.04);
        }

        .pt-island-name {
            font-family: var(--font-dhivehi);
            font-size: 1.7rem;
            font-weight: 700;
            color: var(--amber);
            line-height: 1.3;
            direction: rtl;
        }

        .pt-island-name-latin {
            font-family: var(--font-ui);
            font-size: 1rem;
            font-weight: 400;
            color: var(--muted);
            margin-inline-start: 0.4rem;
        }

        .pt-greg {
            font-family: var(--font-ui);
            font-size: 1.05rem;
            font-weight: 600;
            color: var(--text);
            margin-top: 0.4rem;
        }

        .pt-hijri {
            font-size: 0.9rem;
            color: var(--muted);
            margin-top: 0.2rem;
        }

        .pt-clock {
            font-family: var(--font-ui);
            font-size: 2.4rem;
            font-weight: 800;
            color: var(--dark);
            letter-spacing: -0.03em;
            margin-top: 0.7rem;
            line-height: 1;
            font-variant-numeric: tabular-nums;
        }

        .pt-clock-label {
            font-size: 0.72rem;
            font-weight: 700;
            color: var(--muted);
            letter-spacing: 0.06em;
            text-transform: uppercase;
            display: block;
            margin-bottom: 0.2rem;
        }

        .pt-clock-ampm {
            font-size: 1rem;
            color: var(--muted);
            font-weight: 600;
            vertical-align: super;
        }

        /* ═══ Next Prayer Hero ═════════════════════════════════════════════ */
        .pt-hero {
            background: var(--next-bg);
            border: 1.5px solid var(--next-border);
            border-radius: var(--radius);
            border-left: 5px solid var(--amber);
            padding: 1.75rem 2rem;
            margin-bottom: 2rem;
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 0.5rem 1.5rem;
            align-items: center;
        }

        .pt-hero-label {
            grid-column: 1 / -1;
            font-size: 0.72rem;
            font-weight: 700;
            color: var(--muted);
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }

        .pt-hero-prayer {
            font-family: var(--font-dhivehi);
            font-size: 2rem;
            font-weight: 700;
            color: var(--amber);
            direction: rtl;
        }

        .pt-hero-time {
            font-size: 0.95rem;
            color: var(--muted);
            margin-top: 0.15rem;
            font-weight: 500;
        }

        .pt-hero-countdown {
            font-size: 2.6rem;
            font-weight: 800;
            color: var(--amber);
            letter-spacing: -0.02em;
            text-align: center;
            font-variant-numeric: tabular-nums;
        }

        .pt-hero-after {
            grid-column: 1 / -1;
            font-size: 0.88rem;
            color: var(--muted);
            margin-top: 0.1rem;
            font-weight: 500;
        }

        @media (max-width: 480px) {
            .pt-hero { grid-template-columns: 1fr; border-left: none; border-top: 4px solid var(--amber); }
            .pt-hero-countdown { font-size: 2.2rem; }
        }

        /* ═══ Prayer Grid ══════════════════════════════════════════════════ */
        .pt-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 1rem;
        }

        .pt-card {
            background: var(--surface);
            border: 1.5px solid var(--border);
            border-radius: var(--radius);
            padding: 1.25rem 1.5rem;
            display: flex;
            align-items: center;
            gap: 1rem;
            transition: border-color 0.2s, transform 0.15s, box-shadow 0.2s;
            position: relative;
            overflow: hidden;
        }

        .pt-card:hover {
            border-color: var(--border-strong);
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(28,20,8,0.07);
        }

        .pt-card.is-next {
            border-color: var(--amber);
            background: var(--amber-light);
            box-shadow: 0 4px 16px var(--amber-glow);
        }

        .pt-card.is-past { opacity: 0.45; }

        .pt-card.is-sunrise {
            background: rgba(212,129,58,0.03);
            border-style: dashed;
        }

        /* Amber left accent bar for next prayer */
        .pt-card.is-next::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0; bottom: 0;
            width: 4px;
            background: var(--amber);
            border-radius: var(--radius) 0 0 var(--radius);
        }

        /* "Next" badge */
        .pt-card.is-next::after {
            content: 'Next';
            position: absolute;
            top: 0.55rem;
            right: 0.7rem;
            font-size: 0.62rem;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: var(--amber);
            background: rgba(212,129,58,0.15);
            padding: 0.15rem 0.5rem;
            border-radius: 4px;
        }

        .pt-card-icon {
            width: 48px;
            height: 48px;
            background: var(--bg);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            font-size: 1.3rem;
            border: 1px solid var(--border);
        }

        .pt-card.is-next    .pt-card-icon { background: rgba(212,129,58,0.15); border-color: rgba(212,129,58,0.3); }
        .pt-card.is-sunrise .pt-card-icon { background: rgba(212,129,58,0.08); }

        .pt-card-body { flex: 1; min-width: 0; }

        .pt-card-name {
            font-family: var(--font-dhivehi);
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--text);
            line-height: 1.3;
            direction: rtl;
        }

        .pt-card.is-sunrise .pt-card-name { font-size: 1rem; color: var(--muted); }

        .pt-card-sub {
            font-size: 0.78rem;
            color: var(--muted);
            margin-top: 0.1rem;
            font-weight: 500;
        }

        .pt-card.is-sunrise .pt-card-sub { font-style: italic; }

        .pt-card-time {
            font-size: 1.5rem;
            font-weight: 800;
            color: var(--text);
            letter-spacing: -0.02em;
            font-variant-numeric: tabular-nums;
        }

        .pt-card.is-next    .pt-card-time { color: var(--amber); }
        .pt-card.is-sunrise .pt-card-time { font-size: 1.3rem; color: var(--muted); font-weight: 600; }

        /* ─── Empty state ─── */
        .pt-empty {
            text-align: center;
            padding: 5rem 1rem;
            color: var(--muted);
        }
        .pt-empty-icon { font-size: 3rem; margin-bottom: 1rem; opacity: 0.35; }
        .pt-empty p    { font-family: var(--font-dhivehi); font-size: 1rem; direction: rtl; }

        /* ═══ Footer ═══════════════════════════════════════════════════════ */
        .pt-footer {
            background: var(--dark);
            color: rgba(255,255,255,0.45);
            text-align: center;
            padding: 1.5rem;
            margin-top: 5rem;
            font-size: 0.82rem;
        }
        .pt-footer a { color: rgba(255,255,255,0.65); transition: color 0.15s; }
        .pt-footer a:hover { color: white; }

        /* ═══ Responsive ════════════════════════════════════════════════════ */
        @media (max-width: 640px) {
            .pt-page-title { display: none; }
            .pt-controls { gap: 0.75rem; }
            .pt-field-date { flex: 1 1 140px; }
        }
    </style>
</head>
<body>

<header class="pt-header" id="ptHeader">
    <div class="pt-header-inner">
        <a href="/" class="pt-logo">
            <img src="{{ $logoUrl }}" alt="{{ $siteName }}">
            <span>{{ $siteName }}</span>
        </a>
        <span class="pt-page-title">🕌 Prayer Times</span>
        <a href="/" class="pt-back-btn">← Back to website</a>
    </div>
</header>

<main>
<div class="pt-page">
<div class="container">

    {{-- ════════════ Controls ════════════ --}}
    <form id="ptForm" method="GET" action="/prayer-times">
        <div class="pt-controls">

            {{-- Island picker --}}
            <div class="pt-field">
                <label class="pt-label">Island — ރަށް</label>
                <x-prayer.island-picker :grouped="$viewModel->grouped" :selectedIsland="$viewModel->selectedIsland"/>
            </div>

            {{-- Date picker --}}
            <div class="pt-field-date">
                <label class="pt-label">Date</label>
                <x-prayer.date-picker :selectedDate="$viewModel->selectedDate"/>
            </div>

            {{-- Geolocation --}}
            <div class="pt-field-geo">
                <button type="button" class="pt-geo-btn" id="geoBtn" title="Use my location">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
                        <circle cx="12" cy="12" r="9" opacity=".25"/>
                    </svg>
                    My Location
                </button>
                <div class="pt-geo-toast" id="geoToast" role="alert" aria-live="polite"></div>
            </div>

        </div>
    </form>

    {{-- ════════════ Context strip ════════════ --}}
    <div class="pt-context">
        <div class="pt-island-name">
            {{ $viewModel->selectedIsland?->name ?? '–' }}
            @if($viewModel->selectedIsland?->nameLatin)
                <span class="pt-island-name-latin">({{ $viewModel->selectedIsland->nameLatin }})</span>
            @endif
        </div>
        <div class="pt-greg">{{ $viewModel->selectedDate->format('l, jS F Y') }}</div>
        <div class="pt-hijri" id="hijriDate">…</div>
        <div class="pt-clock">
            <span class="pt-clock-label">Maldives Time</span>
            <span id="clockDisplay">––:––:––</span>
        </div>
    </div>

    @if($viewModel->prayers)

        {{-- ════════════ Next Prayer Hero ════════════ --}}
        <div class="pt-hero" id="heroBox">
            <div class="pt-hero-label">Next Prayer</div>
            <div>
                <div class="pt-hero-prayer" id="heroName">–</div>
                <div class="pt-hero-time" id="heroTime"></div>
            </div>
            <div class="pt-hero-countdown" id="heroCountdown">––:––:––</div>
            <div class="pt-hero-after" id="heroAfter"></div>
        </div>

        {{-- ════════════ Prayer cards ════════════ --}}
        <div class="pt-grid" id="prayerGrid">
            @foreach($viewModel->prayerDefs() as $key => $def)
                @php $time = $viewModel->prayers->toArray()[$key]; @endphp
                <div class="pt-card {{ $def['isSunrise'] ? 'is-sunrise' : '' }}"
                     data-prayer="{{ $key }}"
                     data-time="{{ $time }}"
                     data-is-salah="{{ $def['isSunrise'] ? '0' : '1' }}">
                    <div class="pt-card-icon">{{ $def['icon'] }}</div>
                    <div class="pt-card-body">
                        <div class="pt-card-name">{{ $def['name'] }}</div>
                        <div class="pt-card-sub">
                            {{ $def['latin'] }}
                            @if($def['isSunrise'])
                                — not a Salah
                            @endif
                        </div>
                    </div>
                    <div class="pt-card-time">{{ $time }}</div>
                </div>
            @endforeach
        </div>

    @else

        <div class="pt-empty">
            <div class="pt-empty-icon">🕌</div>
            <p>މި ތާރީޙަށް ނަމާދު ވަގުތު ހޯދިއެއް ނުގެ.</p>
        </div>

    @endif

</div>
</div>
</main>

<footer class="pt-footer">
    Prayer times for all islands of Maldives &mdash;
    <a href="/">{{ $siteName }}</a> &mdash;
    {{ date('Y') }}
</footer>

<script>
(function () {
    'use strict';

    /* ── Scrolled header shadow ─────────────────────────────────────────── */
    const hdr = document.getElementById('ptHeader');
    if (hdr) window.addEventListener('scroll', () => hdr.classList.toggle('scrolled', scrollY > 10), { passive: true });

    /* ══════════════════════════════════════════════════════════════════════
       Island dropdown
    ══════════════════════════════════════════════════════════════════════ */
    (function initIslandPicker() {
        const trigger = document.getElementById('islTrigger');
        const panel   = document.getElementById('islPanel');
        const search  = document.getElementById('islSearch');
        const list    = document.getElementById('islList');
        const noRes   = document.getElementById('islNoResults');
        const hidden  = document.getElementById('island_id');

        if (!trigger) return;

        function close() {
            panel.classList.remove('open');
            trigger.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
        }

        trigger.addEventListener('click', () => {
            const opening = !panel.classList.contains('open');
            panel.classList.toggle('open', opening);
            trigger.classList.toggle('open', opening);
            trigger.setAttribute('aria-expanded', String(opening));
            if (opening) { setTimeout(() => search.focus(), 50); }
        });

        document.addEventListener('click', e => {
            if (!document.getElementById('islDropdown').contains(e.target)) close();
        });

        document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

        search.addEventListener('input', () => {
            const q = search.value.trim().toLowerCase();
            let anyVisible = false;
            list.querySelectorAll('.isl-group').forEach(group => {
                let groupHas = false;
                group.querySelectorAll('.isl-option').forEach(opt => {
                    const match = !q || opt.dataset.dv.toLowerCase().includes(q)
                        || opt.dataset.lat.includes(q) || opt.dataset.atoll.includes(q);
                    opt.style.display = match ? '' : 'none';
                    if (match) groupHas = true;
                });
                group.style.display = groupHas ? '' : 'none';
                if (groupHas) anyVisible = true;
            });
            noRes.style.display = anyVisible ? 'none' : '';
        });

        list.querySelectorAll('.isl-option').forEach(opt => {
            opt.addEventListener('click', () => {
                hidden.value = opt.dataset.id;
                trigger.querySelector('.isl-trigger-dv').textContent = opt.dataset.dv;

                const existLat = trigger.querySelector('.isl-trigger-latin');
                if (opt.dataset.lat) {
                    if (existLat) { existLat.textContent = '(' + opt.dataset.lat + ')'; }
                    else {
                        const s = document.createElement('span');
                        s.className = 'isl-trigger-latin';
                        s.textContent = '(' + opt.dataset.lat + ')';
                        trigger.querySelector('.isl-arrow').before(s);
                    }
                } else if (existLat) { existLat.remove(); }

                list.querySelectorAll('.isl-option').forEach(o => {
                    o.classList.remove('selected'); o.setAttribute('aria-selected', 'false');
                });
                opt.classList.add('selected'); opt.setAttribute('aria-selected', 'true');

                close();
                search.value = '';
                list.querySelectorAll('.isl-group, .isl-option').forEach(el => el.style.display = '');
                noRes.style.display = 'none';
                document.getElementById('ptForm').submit();
            });
        });
    })();

    /* ══════════════════════════════════════════════════════════════════════
       Date picker
    ══════════════════════════════════════════════════════════════════════ */
    (function initDatePicker() {
        const input   = document.getElementById('ptDate');
        const display = document.getElementById('dateDisplayText');
        if (!input || !display) return;

        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

        function formatDate(d) {
            const day = d.getDate();
            const sfx = (day%10===1&&day!==11)?'st':(day%10===2&&day!==12)?'nd':(day%10===3&&day!==13)?'rd':'th';
            return day + sfx + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
        }

        input.addEventListener('change', function () {
            if (!this.value) return;
            display.textContent = formatDate(new Date(this.value + 'T00:00:00'));
            document.getElementById('ptForm').submit();
        });
    })();

    /* ══════════════════════════════════════════════════════════════════════
       Geolocation
    ══════════════════════════════════════════════════════════════════════ */
    (function initGeo() {
        const btn   = document.getElementById('geoBtn');
        const toast = document.getElementById('geoToast');
        if (!btn) return;

        function showToast(msg, isError) {
            toast.textContent = msg;
            toast.className   = 'pt-geo-toast' + (isError ? ' error' : '');
            toast.style.display = 'block';
            setTimeout(() => { toast.style.display = 'none'; }, 4000);
        }

        function resetBtn() {
            btn.disabled = false;
            const nodes = [...btn.childNodes];
            const t = nodes.find(n => n.nodeType === 3 && n.textContent.trim());
            if (t) t.textContent = ' My Location';
        }

        btn.addEventListener('click', function () {
            if (!navigator.geolocation) { showToast('Geolocation not supported.', true); return; }
            btn.disabled = true;
            const nodes = [...btn.childNodes];
            const t = nodes.find(n => n.nodeType === 3 && n.textContent.trim());
            if (t) t.textContent = ' Detecting…';

            navigator.geolocation.getCurrentPosition(
                pos => {
                    const { latitude, longitude } = pos.coords;
                    fetch('/api/prayer-times/nearest?lat=' + latitude + '&lng=' + longitude)
                        .then(r => r.json())
                        .then(data => {
                            if (data.island) {
                                document.getElementById('island_id').value = data.island.id;
                                document.getElementById('ptForm').submit();
                            } else {
                                showToast('No nearby island found.', true);
                                resetBtn();
                            }
                        })
                        .catch(() => { showToast('Could not connect. Please try again.', true); resetBtn(); });
                },
                err => {
                    const msgs = { 1: 'Location permission denied.', 2: 'Location unavailable.', 3: 'Location request timed out.' };
                    showToast(msgs[err.code] ?? 'Could not get location.', true);
                    resetBtn();
                },
                { timeout: 10000 }
            );
        });
    })();

    /* ══════════════════════════════════════════════════════════════════════
       Hijri date
    ══════════════════════════════════════════════════════════════════════ */
    (function setHijri() {
        const el = document.getElementById('hijriDate');
        if (!el) return;
        try {
            const d     = new Date('{{ $viewModel->selectedDate->toDateString() }}T12:00:00');
            const parts = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
                day: 'numeric', month: 'long', year: 'numeric',
            }).formatToParts(d);
            el.textContent = parts.map(p => p.value).join('');
        } catch { el.textContent = ''; }
    })();

    /* ══════════════════════════════════════════════════════════════════════
       Maldives live clock (UTC+5)
    ══════════════════════════════════════════════════════════════════════ */
    function getMVT() { return new Date(Date.now() + 5 * 3600 * 1000); }

    (function initClock() {
        const display = document.getElementById('clockDisplay');
        if (!display) return;

        function tick() {
            const mv  = getMVT();
            const h24 = mv.getUTCHours(), h12 = h24 % 12 || 12;
            const m   = String(mv.getUTCMinutes()).padStart(2, '0');
            const s   = String(mv.getUTCSeconds()).padStart(2, '0');
            const ap  = h24 >= 12 ? 'PM' : 'AM';
            display.innerHTML = String(h12).padStart(2, '0') + ':' + m + ':' + s +
                ' <span class="pt-clock-ampm">' + ap + '</span>';
        }

        tick();
        setInterval(tick, 1000);
    })();

    /* ══════════════════════════════════════════════════════════════════════
       Next-prayer hero + card highlights
    ══════════════════════════════════════════════════════════════════════ */
    const IS_TODAY = {{ $viewModel->isToday() ? 'true' : 'false' }};

    @if($viewModel->prayers)
    (function initCountdown() {
        if (!IS_TODAY) return;

        const PRAYER_NAMES_DV = {
            fajr: 'ފަތިސް', dhuhr: 'މެންދުރު',
            asr: 'އަޞްރު', maghrib: 'މަޣްރިބް', isha: 'ޢިޝާ',
        };
        const PRAYER_NAMES_EN = {
            fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha',
        };

        function parseHHMM(s) { const [h,m]=s.split(':').map(Number); return h*60+m; }

        function formatCountdown(diffMs) {
            const total=Math.max(0,Math.floor(diffMs/1000));
            const h=Math.floor(total/3600), m=Math.floor((total%3600)/60), s=total%60;
            return [h,m,s].map(v=>String(v).padStart(2,'0')).join(':');
        }

        function getCards() { return [...document.querySelectorAll('.pt-card')]; }

        function findNextSalah(nowMin) {
            for (const card of getCards()) {
                if (card.dataset.isSalah !== '1') continue;
                if (parseHHMM(card.dataset.time) > nowMin)
                    return { key: card.dataset.prayer, time: card.dataset.time };
            }
            return null;
        }

        function findAfterNext(nextKey) {
            const sc = getCards().filter(c => c.dataset.isSalah === '1');
            const idx = sc.findIndex(c => c.dataset.prayer === nextKey);
            return idx >= 0 && idx + 1 < sc.length ? sc[idx + 1] : null;
        }

        function tick() {
            const mvNow  = getMVT();
            const nowMin = mvNow.getUTCHours() * 60 + mvNow.getUTCMinutes();
            const cards  = getCards();

            let nextFound = false;
            cards.forEach(card => {
                card.classList.remove('is-next', 'is-past');
                if (card.dataset.isSalah !== '1') return;
                const t = parseHHMM(card.dataset.time);
                if (!nextFound && t > nowMin) { card.classList.add('is-next'); nextFound = true; }
                else if (t < nowMin) { card.classList.add('is-past'); }
            });

            const next    = findNextSalah(nowMin);
            const heroBox = document.getElementById('heroBox');

            if (next) {
                document.getElementById('heroName').textContent = PRAYER_NAMES_DV[next.key] ?? next.key;
                document.getElementById('heroTime').textContent = PRAYER_NAMES_EN[next.key] + ' — ' + next.time;

                const [nh,nm] = next.time.split(':').map(Number);
                const diffMs  = ((nh*60+nm) - nowMin) * 60000 - mvNow.getUTCSeconds() * 1000;
                document.getElementById('heroCountdown').textContent = formatCountdown(diffMs);

                const afterCard = findAfterNext(next.key);
                document.getElementById('heroAfter').textContent = afterCard
                    ? 'Then: ' + (PRAYER_NAMES_EN[afterCard.dataset.prayer] ?? afterCard.dataset.prayer) + ' at ' + afterCard.dataset.time
                    : '';
            } else {
                if (!window._tomorrowFajrFetched) {
                    window._tomorrowFajrFetched = true;
                    const islandId = {{ $viewModel->selectedIsland?->id ?? 'null' }};
                    if (islandId) {
                        const tmrw = getMVT();
                        tmrw.setUTCDate(tmrw.getUTCDate() + 1);
                        const tmrwStr = tmrw.getUTCFullYear() + '-' +
                            String(tmrw.getUTCMonth()+1).padStart(2,'0') + '-' +
                            String(tmrw.getUTCDate()).padStart(2,'0');
                        fetch('/api/prayer-times?island_id=' + islandId + '&date=' + tmrwStr)
                            .then(r => r.json())
                            .then(data => { window._tomorrowFajrTime = data?.prayers?.fajr ?? null; })
                            .catch(() => {});
                    }
                }

                if (window._tomorrowFajrTime) {
                    if (heroBox) heroBox.style.opacity = '1';
                    document.getElementById('heroName').textContent = PRAYER_NAMES_DV['fajr'];
                    document.getElementById('heroTime').textContent = 'Fajr — ' + window._tomorrowFajrTime + ' · Tomorrow';
                    const [fh,fm] = window._tomorrowFajrTime.split(':').map(Number);
                    const diffMs  = ((24*60 - nowMin) + fh*60 + fm) * 60000 - mvNow.getUTCSeconds() * 1000;
                    document.getElementById('heroCountdown').textContent = formatCountdown(diffMs);
                    document.getElementById('heroAfter').textContent = '';
                } else {
                    if (heroBox) heroBox.style.opacity = '.55';
                    document.getElementById('heroName').textContent     = 'ތިން ދަމު ދިޔަ';
                    document.getElementById('heroTime').textContent      = 'All prayers completed for today';
                    document.getElementById('heroCountdown').textContent = '––:––:––';
                    document.getElementById('heroAfter').textContent     = '';
                }
            }
        }

        tick();
        setInterval(tick, 1000);
    })();
    @endif

})();
</script>
</body>
</html>
