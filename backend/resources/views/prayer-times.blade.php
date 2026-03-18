<!DOCTYPE html>
<html lang="dv" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="ދިވެހިރާއްޖޭގެ ހުރިހާ ރަށެއްގެ ނަމާދު ވަގުތު">
    <title>{{ $viewModel->pageTitle() }}</title>

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
    <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600;700&display=swap" rel="stylesheet">

    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
            --bg:          #F7F1E3;
            --surface:     #FFFDF8;
            --surface-2:   #F0E8D5;
            --primary:     #0F5C4D;
            --primary-l:   #1A7A65;
            --teal:        #0E7490;
            --gold:        #C9A227;
            --gold-l:      #E8C547;
            --ink:         #1F1A17;
            --muted:       #7C6E58;
            --border:      #E8DDC5;
            --border-strong:#C4B49A;
            --next-bg:     rgba(15,92,77,0.06);
            --next-border:  rgba(15,92,77,0.25);
            --error:       #A61E2D;

            --radius:      16px;
            --radius-sm:   10px;
            --radius-xs:   6px;

            --font-dhivehi: 'A_Faruma', 'MV Faseyha', 'MV Waheed', serif;
            --font-latin:   'Crimson Pro', Georgia, serif;
            --font-body:    'Crimson Pro', Georgia, serif;
        }

        html { font-size: 16px; scroll-behavior: smooth; }

        body {
            background: var(--bg);
            color: var(--ink);
            font-family: var(--font-dhivehi);
            min-height: 100vh;
            line-height: 1.6;
        }

        a { color: var(--primary); text-decoration: none; }
        a:hover { text-decoration: underline; }

        .container { max-width: 1060px; margin: 0 auto; padding: 0 1.25rem; }

        /* ── Site Header ── */
        .site-header {
            background: var(--surface);
            border-bottom: 3px solid var(--gold);
            padding: 1rem 0;
            position: relative;
            overflow: hidden;
        }

        .site-header::before {
            content: '';
            position: absolute;
            inset: 0;
            background-image:
                radial-gradient(circle at 20% 50%, rgba(201,162,39,0.05) 0%, transparent 50%),
                radial-gradient(circle at 80% 50%, rgba(15,92,77,0.05) 0%, transparent 50%);
            pointer-events: none;
        }

        .site-header .inner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: relative;
        }

        .site-logo {
            display: flex;
            align-items: center;
            gap: .75rem;
            text-decoration: none;
        }

        .site-logo-icon {
            width: 40px;
            height: 40px;
            background: var(--primary);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        .site-logo-icon svg {
            width: 22px;
            height: 22px;
            fill: var(--gold);
        }

        .site-logo-text {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
        }

        .site-logo-dv {
            font-family: var(--font-dhivehi);
            font-size: 1.2rem;
            font-weight: 700;
            color: var(--primary);
            line-height: 1.2;
        }

        .site-logo-latin {
            font-family: var(--font-latin);
            font-size: .82rem;
            color: var(--muted);
            font-weight: 500;
            letter-spacing: .04em;
            direction: ltr;
        }

        /* ── Footer ── */
        .site-footer {
            background: var(--surface);
            border-top: 1px solid var(--border);
            text-align: center;
            padding: 1.5rem 0;
            color: var(--muted);
            font-size: .88rem;
            margin-top: 4rem;
            font-family: var(--font-body);
            direction: ltr;
        }

        .site-footer strong { color: var(--primary); font-weight: 600; }

        /* ═══════════════════════ Page ═══════════════════════ */
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
            box-shadow: 0 2px 12px rgba(15,92,77,.06);
        }

        .pt-field { flex: 1 1 240px; }
        .pt-field-date { flex: 0 0 160px; }
        .pt-field-geo { flex: 0 0 auto; align-self: flex-end; }

        .pt-label {
            display: block;
            font-family: var(--font-body);
            font-size: .78rem;
            color: var(--muted);
            margin-bottom: .45rem;
            direction: ltr;
            text-align: start;
            letter-spacing: .04em;
            text-transform: uppercase;
        }

        /* ─── Island dropdown ─── */
        .isl-dropdown { position: relative; width: 100%; }

        .isl-trigger {
            width: 100%;
            display: flex;
            align-items: center;
            gap: .5rem;
            background: var(--surface-2);
            border: 1.5px solid var(--border);
            border-radius: var(--radius-sm);
            padding: .65rem 1rem;
            font-family: var(--font-dhivehi);
            font-size: 1rem;
            color: var(--ink);
            cursor: pointer;
            text-align: right;
            direction: rtl;
            transition: border-color .2s, box-shadow .2s;
        }

        .isl-trigger:hover,
        .isl-trigger.open { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(15,92,77,.1); }

        .isl-trigger-dv { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .isl-trigger-latin {
            font-family: var(--font-body);
            font-size: .82rem;
            color: var(--muted);
            white-space: nowrap;
            flex-shrink: 0;
        }
        .isl-arrow {
            font-size: .65rem;
            color: var(--muted);
            flex-shrink: 0;
            transition: transform .2s;
            margin-inline-end: 2px;
        }
        .isl-trigger.open .isl-arrow { transform: rotate(180deg); }

        .isl-panel {
            position: absolute;
            top: calc(100% + 4px);
            left: 0; right: 0;
            background: var(--surface);
            border: 1.5px solid var(--primary);
            border-radius: var(--radius-sm);
            z-index: 1000;
            display: none;
            flex-direction: column;
            max-height: 360px;
            box-shadow: 0 12px 32px rgba(15,92,77,.18), 0 2px 8px rgba(0,0,0,.08);
        }
        .isl-panel.open { display: flex; }

        .isl-search {
            padding: .6rem .75rem;
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
        }
        .isl-search input {
            width: 100%;
            background: var(--surface-2);
            color: var(--ink);
            border: 1px solid var(--border);
            border-radius: var(--radius-xs);
            padding: .45rem .7rem;
            font-family: var(--font-body);
            font-size: .92rem;
            outline: none;
            direction: ltr;
            transition: border-color .2s;
        }
        .isl-search input:focus { border-color: var(--primary); }

        .isl-list { overflow-y: auto; flex: 1; }

        .isl-group-label {
            padding: .5rem .9rem .3rem;
            font-family: var(--font-body);
            font-size: .72rem;
            color: var(--primary);
            letter-spacing: .06em;
            text-transform: uppercase;
            background: var(--surface);
            position: sticky;
            top: 0;
            border-bottom: 1px solid var(--border);
            direction: ltr;
            display: flex;
            align-items: center;
            gap: .4rem;
        }
        .isl-group-label-lat { color: var(--muted); font-weight: 400; }

        .isl-option {
            padding: .55rem 1rem;
            cursor: pointer;
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: .5rem;
            direction: rtl;
            transition: background .12s;
        }
        .isl-option:hover,
        .isl-option.active { background: var(--surface-2); }
        .isl-option.selected .isl-opt-dv { color: var(--primary); font-weight: 600; }

        .isl-opt-dv { font-family: var(--font-dhivehi); font-size: .98rem; }
        .isl-opt-lat { font-family: var(--font-body); font-size: .8rem; color: var(--muted); white-space: nowrap; }
        .isl-no-results {
            padding: 1.25rem;
            text-align: center;
            color: var(--muted);
            font-family: var(--font-body);
            font-size: .9rem;
            direction: ltr;
        }

        /* ─── Date picker wrapper ─── */
        .date-picker-wrap { position: relative; width: 100%; }

        .date-display {
            display: flex;
            align-items: center;
            gap: .5rem;
            background: var(--surface-2);
            border: 1.5px solid var(--border);
            border-radius: var(--radius-sm);
            padding: .65rem 1rem;
            font-family: var(--font-body);
            font-size: .98rem;
            color: var(--ink);
            width: 100%;
            white-space: nowrap;
            direction: ltr;
            pointer-events: none;
            user-select: none;
        }

        .date-picker-wrap:hover .date-display,
        .date-picker-wrap:focus-within .date-display {
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(15,92,77,.1);
        }

        .date-icon { width: 16px; height: 16px; color: var(--primary); flex-shrink: 0; }

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
            gap: .5rem;
            padding: .65rem 1.1rem;
            background: transparent;
            border: 1.5px solid var(--primary);
            border-radius: var(--radius-sm);
            color: var(--primary);
            font-family: var(--font-dhivehi);
            font-size: .95rem;
            cursor: pointer;
            white-space: nowrap;
            transition: background .2s, border-color .2s;
        }
        .pt-geo-btn:hover { background: rgba(15,92,77,.07); }
        .pt-geo-btn svg { width: 16px; height: 16px; flex-shrink: 0; }

        /* ─── Geo toast ─── */
        .pt-geo-toast {
            display: none;
            margin-top: .5rem;
            padding: .55rem .9rem;
            border-radius: var(--radius-xs);
            font-family: var(--font-body);
            font-size: .88rem;
            direction: ltr;
            background: #FEF3C7;
            color: #92400E;
            border: 1px solid #FCD34D;
        }
        .pt-geo-toast.error { background: #FEE2E2; color: #991B1B; border-color: #FCA5A5; }

        /* ═══════════════════════ Context strip ═══════════════════════ */
        .pt-context {
            text-align: center;
            margin-bottom: 2rem;
            padding: 1.5rem 1rem;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            box-shadow: 0 2px 10px rgba(15,92,77,.05);
        }

        .pt-island-name {
            font-family: var(--font-dhivehi);
            font-size: 1.6rem;
            font-weight: 700;
            color: var(--primary);
            line-height: 1.3;
        }

        .pt-island-name-latin {
            font-family: var(--font-body);
            font-size: 1rem;
            font-weight: 400;
            color: var(--muted);
            margin-inline-start: .4rem;
        }

        .pt-greg {
            font-family: var(--font-latin);
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--ink);
            margin-top: .4rem;
        }

        .pt-hijri {
            font-family: var(--font-body);
            font-size: .92rem;
            color: var(--muted);
            margin-top: .2rem;
        }

        .pt-clock {
            font-family: var(--font-latin);
            font-size: 2.4rem;
            font-weight: 700;
            color: var(--ink);
            letter-spacing: .06em;
            margin-top: .6rem;
            line-height: 1;
        }

        .pt-clock-label {
            font-family: var(--font-body);
            font-size: .78rem;
            font-weight: 400;
            color: var(--muted);
            letter-spacing: .04em;
            display: block;
            margin-bottom: .15rem;
        }

        .pt-clock-ampm {
            font-size: .9rem;
            color: var(--muted);
            font-weight: 500;
            vertical-align: super;
        }

        /* ═══════════════════════ Next Prayer Hero ═══════════════════════ */
        .pt-hero {
            background: var(--next-bg);
            border: 2px solid var(--next-border);
            border-radius: var(--radius);
            border-right: 5px solid var(--gold);
            padding: 1.75rem 2rem;
            margin-bottom: 2rem;
            display: grid;
            grid-template-columns: 1fr auto;
            gap: .5rem 1.5rem;
            align-items: center;
        }

        .pt-hero-label {
            grid-column: 1 / -1;
            font-family: var(--font-body);
            font-size: .82rem;
            color: var(--muted);
            text-transform: uppercase;
            letter-spacing: .07em;
            direction: ltr;
        }

        .pt-hero-prayer {
            font-family: var(--font-dhivehi);
            font-size: 2rem;
            font-weight: 700;
            color: var(--primary);
        }

        .pt-hero-time {
            font-family: var(--font-latin);
            font-size: 1rem;
            color: var(--muted);
            margin-top: .15rem;
        }

        .pt-hero-countdown {
            font-family: var(--font-latin);
            font-size: 2.6rem;
            font-weight: 700;
            color: var(--gold);
            letter-spacing: .05em;
            text-align: center;
            font-variant-numeric: tabular-nums;
            direction: ltr;
        }

        .pt-hero-after {
            grid-column: 1 / -1;
            font-family: var(--font-body);
            font-size: .88rem;
            color: var(--muted);
            margin-top: .1rem;
            direction: ltr;
        }

        @media (max-width: 480px) {
            .pt-hero { grid-template-columns: 1fr; border-right: none; border-top: 4px solid var(--gold); }
            .pt-hero-countdown { font-size: 2.2rem; text-align: right; }
        }

        /* ═══════════════════════ Prayer Grid ═══════════════════════ */
        .pt-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
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
            transition: border-color .2s, transform .15s, box-shadow .2s;
            position: relative;
            overflow: hidden;
        }

        .pt-card:hover {
            border-color: var(--border-strong);
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(15,92,77,.1);
        }

        .pt-card.is-next {
            border-color: var(--gold);
            background: rgba(201,162,39,.06);
            box-shadow: 0 4px 16px rgba(201,162,39,.15);
        }

        .pt-card.is-past { opacity: .5; }

        .pt-card.is-sunrise {
            background: rgba(201,162,39,.03);
            border-style: dashed;
        }

        .pt-card.is-next::before {
            content: '';
            position: absolute;
            right: 0;
            top: 0;
            bottom: 0;
            width: 4px;
            background: var(--gold);
            border-radius: 0 var(--radius) var(--radius) 0;
        }

        .pt-card.is-next::after {
            content: 'ދެން';
            position: absolute;
            top: .55rem;
            left: .7rem;
            font-family: var(--font-dhivehi);
            font-size: .68rem;
            color: var(--gold);
            background: rgba(201,162,39,.12);
            padding: .15rem .45rem;
            border-radius: 4px;
            font-weight: 600;
        }

        .pt-card-icon {
            width: 48px;
            height: 48px;
            background: var(--surface-2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            font-size: 1.35rem;
        }

        .pt-card.is-next .pt-card-icon { background: rgba(201,162,39,.15); }
        .pt-card.is-sunrise .pt-card-icon { background: rgba(201,162,39,.1); }

        .pt-card-body { flex: 1; min-width: 0; }

        .pt-card-name {
            font-family: var(--font-dhivehi);
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--ink);
            line-height: 1.3;
        }

        .pt-card.is-sunrise .pt-card-name { font-size: 1rem; color: var(--muted); }

        .pt-card-sub {
            font-family: var(--font-body);
            font-size: .8rem;
            color: var(--muted);
            margin-top: .1rem;
        }

        .pt-card.is-sunrise .pt-card-sub { font-style: italic; }

        .pt-card-time {
            font-family: var(--font-latin);
            font-size: 1.55rem;
            font-weight: 700;
            color: var(--ink);
            letter-spacing: .02em;
            font-variant-numeric: tabular-nums;
        }

        .pt-card.is-next .pt-card-time { color: var(--primary); }
        .pt-card.is-sunrise .pt-card-time { font-size: 1.35rem; color: var(--muted); }

        /* ─── Empty state ─── */
        .pt-empty {
            text-align: center;
            padding: 5rem 1rem;
            color: var(--muted);
            font-family: var(--font-body);
        }
        .pt-empty-icon { font-size: 3rem; margin-bottom: 1rem; opacity: .4; }
    </style>
</head>
<body>

<header class="site-header">
    <div class="container inner">
        <a href="/prayer-times" class="site-logo">
            <div class="site-logo-icon">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
            </div>
            <div class="site-logo-text">
                <span class="site-logo-dv">ނަމާދު ވަގުތު</span>
                <span class="site-logo-latin">Maldives Prayer Times</span>
            </div>
        </a>
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
                <label class="pt-label">Date — ތާރީޙް</label>
                <x-prayer.date-picker :selectedDate="$viewModel->selectedDate"/>
            </div>

            {{-- Geolocation --}}
            <div class="pt-field-geo">
                <button type="button" class="pt-geo-btn" id="geoBtn" title="ތިބާ ހުރި ތަން ހޯދުން">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
                        <circle cx="12" cy="12" r="9" opacity=".25"/>
                    </svg>
                    ތިބާ ހުރި ތަން
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
        <div class="pt-greg">{{ $viewModel->selectedDate->format('jS M Y') }}</div>
        <div class="pt-hijri" id="hijriDate">…</div>
        <div class="pt-clock">
            <span class="pt-clock-label">ރާއްޖެ ގަޑި</span>
            <span id="clockDisplay">––:––:––</span>
        </div>
    </div>

    @if($viewModel->prayers)

        {{-- ════════════ Next Prayer Hero ════════════ --}}
        <div class="pt-hero" id="heroBox">
            <div class="pt-hero-label">Next Prayer — ދެން ވަންނަ ނަމާދު</div>
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

<footer class="site-footer">
    <div class="container">
        <p>
            <strong>Maldives Prayer Times</strong> &mdash;
            Accurate daily prayer times for all islands &mdash;
            {{ date('Y') }}
        </p>
    </div>
</footer>

<script>
(function () {
    'use strict';

    /* ═══════════════════════════════════════════
       Island dropdown
    ═══════════════════════════════════════════ */
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

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') close();
        });

        search.addEventListener('input', () => {
            const q = search.value.trim().toLowerCase();
            let anyVisible = false;
            list.querySelectorAll('.isl-group').forEach(group => {
                let groupHas = false;
                group.querySelectorAll('.isl-option').forEach(opt => {
                    const dv    = opt.dataset.dv.toLowerCase();
                    const lat   = opt.dataset.lat;
                    const atoll = opt.dataset.atoll;
                    const match = !q || dv.includes(q) || lat.includes(q) || atoll.includes(q);
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
                const id      = opt.dataset.id;
                const dv      = opt.dataset.dv;
                const latName = opt.dataset.lat;

                hidden.value = id;
                trigger.querySelector('.isl-trigger-dv').textContent = dv;

                const existLat = trigger.querySelector('.isl-trigger-latin');
                if (latName) {
                    if (existLat) {
                        existLat.textContent = '(' + latName + ')';
                    } else {
                        const s = document.createElement('span');
                        s.className = 'isl-trigger-latin';
                        s.textContent = '(' + latName + ')';
                        trigger.querySelector('.isl-arrow').before(s);
                    }
                } else if (existLat) {
                    existLat.remove();
                }

                list.querySelectorAll('.isl-option').forEach(o => {
                    o.classList.remove('selected');
                    o.setAttribute('aria-selected', 'false');
                });
                opt.classList.add('selected');
                opt.setAttribute('aria-selected', 'true');

                close();
                search.value = '';
                list.querySelectorAll('.isl-group, .isl-option').forEach(el => el.style.display = '');
                noRes.style.display = 'none';

                document.getElementById('ptForm').submit();
            });
        });
    })();

    /* ═══════════════════════════════════════════
       Date picker
    ═══════════════════════════════════════════ */
    (function initDatePicker() {
        const input   = document.getElementById('ptDate');
        const display = document.getElementById('dateDisplayText');
        if (!input || !display) return;

        const MONTHS = [
            'Jan','Feb','Mar','Apr','May','Jun',
            'Jul','Aug','Sep','Oct','Nov','Dec',
        ];

        function formatDate(d) {
            const day    = d.getDate();
            const suffix = (day % 10 === 1 && day !== 11) ? 'st'
                         : (day % 10 === 2 && day !== 12) ? 'nd'
                         : (day % 10 === 3 && day !== 13) ? 'rd' : 'th';
            return day + suffix + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
        }

        input.addEventListener('change', function () {
            if (!this.value) return;
            const d = new Date(this.value + 'T00:00:00');
            display.textContent = formatDate(d);
            document.getElementById('ptForm').submit();
        });
    })();

    /* ═══════════════════════════════════════════
       Geolocation
    ═══════════════════════════════════════════ */
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
            btn.querySelector('svg').style.display = '';
            const nodes = [...btn.childNodes];
            const textNode = nodes.find(n => n.nodeType === 3 && n.textContent.trim());
            if (textNode) textNode.textContent = ' ތިބާ ހުރި ތަން';
        }

        btn.addEventListener('click', function () {
            if (!navigator.geolocation) {
                showToast('ތިބާ ހުރި ތަން ހޯދޭ ޑިވައިސެއް ނެތް.', true);
                return;
            }

            btn.disabled = true;
            const nodes = [...btn.childNodes];
            const textNode = nodes.find(n => n.nodeType === 3 && n.textContent.trim());
            if (textNode) textNode.textContent = ' ހޯދަނީ…';

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
                                showToast('ކައިރި ރަށެއް ނުފެނުނު.', true);
                                resetBtn();
                            }
                        })
                        .catch(() => {
                            showToast('ސާވަރ އާ ގުޅޭ ގޮތް ނުވި. އަލުން ތަކުރާރު ކޮށްލާ.', true);
                            resetBtn();
                        });
                },
                err => {
                    const messages = {
                        1: 'ތިބާ ހުރި ތަން ހޯދުމަށް ހުއްދަ ދެއްވާ.',
                        2: 'ތިބާ ހުރި ތަން ނޭނގުނު.',
                        3: 'ތިބާ ހުރި ތަން ހޯދުމަށް ގިނަ ވަގުތު ނެގި.',
                    };
                    showToast(messages[err.code] ?? 'ތިބާ ހުރި ތަން ހޯދިއެއް ނުފެނުނު.', true);
                    resetBtn();
                },
                { timeout: 10000 }
            );
        });
    })();

    /* ═══════════════════════════════════════════
       Hijri date
    ═══════════════════════════════════════════ */
    (function setHijri() {
        const el = document.getElementById('hijriDate');
        if (!el) return;
        try {
            const d     = new Date('{{ $viewModel->selectedDate->toDateString() }}T12:00:00');
            const parts = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
                day: 'numeric', month: 'long', year: 'numeric',
            }).formatToParts(d);
            el.textContent = parts.map(p => p.value).join('');
        } catch {
            el.textContent = '';
        }
    })();

    /* ═══════════════════════════════════════════
       Maldives live clock (UTC+5)
    ═══════════════════════════════════════════ */
    (function initClock() {
        const display = document.getElementById('clockDisplay');
        if (!display) return;

        function tick() {
            const mv  = getMVT();
            const h24 = mv.getUTCHours();
            const h12 = h24 % 12 || 12;
            const m   = String(mv.getUTCMinutes()).padStart(2, '0');
            const s   = String(mv.getUTCSeconds()).padStart(2, '0');
            const ap  = h24 >= 12 ? 'PM' : 'AM';
            display.innerHTML = String(h12).padStart(2, '0') + ':' + m + ':' + s +
                ' <span class="pt-clock-ampm">' + ap + '</span>';
        }

        tick();
        setInterval(tick, 1000);
    })();

    /* ═══════════════════════════════════════════
       Next-prayer hero + card highlights
    ═══════════════════════════════════════════ */
    function getMVT() {
        return new Date(Date.now() + 5 * 3600 * 1000);
    }

    const IS_TODAY = {{ $viewModel->isToday() ? 'true' : 'false' }};

    @if($viewModel->prayers)
    (function initCountdown() {
        if (!IS_TODAY) return;

        const PRAYER_NAMES_DV = {
            fajr: 'ފަތިސް', dhuhr: 'މެންދުރު',
            asr: 'އަޞްރު', maghrib: 'މަޣްރިބް', isha: 'ޢިޝާ',
        };

        const PRAYER_NAMES_EN = {
            fajr: 'Fajr', dhuhr: 'Dhuhr',
            asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha',
        };

        function parseHHMM(s) {
            const [h, m] = s.split(':').map(Number);
            return h * 60 + m;
        }

        function formatCountdown(diffMs) {
            const total = Math.max(0, Math.floor(diffMs / 1000));
            const h = Math.floor(total / 3600);
            const m = Math.floor((total % 3600) / 60);
            const s = total % 60;
            return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
        }

        function getCards() {
            return [...document.querySelectorAll('.pt-card')];
        }

        function findNextSalah(nowMin) {
            const cards = getCards();
            for (const card of cards) {
                if (card.dataset.isSalah !== '1') continue;
                if (parseHHMM(card.dataset.time) > nowMin) {
                    return { key: card.dataset.prayer, time: card.dataset.time };
                }
            }
            return null;
        }

        function findAfterNext(nextKey) {
            const salahCards = getCards().filter(c => c.dataset.isSalah === '1');
            const idx = salahCards.findIndex(c => c.dataset.prayer === nextKey);
            return idx >= 0 && idx + 1 < salahCards.length ? salahCards[idx + 1] : null;
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
                if (!nextFound && t > nowMin) {
                    card.classList.add('is-next');
                    nextFound = true;
                } else if (t < nowMin) {
                    card.classList.add('is-past');
                }
            });

            const next    = findNextSalah(nowMin);
            const heroBox = document.getElementById('heroBox');

            if (next) {
                document.getElementById('heroName').textContent  = PRAYER_NAMES_DV[next.key] ?? next.key;
                document.getElementById('heroTime').textContent  = PRAYER_NAMES_EN[next.key] + ' — ' + next.time;

                const [nh, nm]  = next.time.split(':').map(Number);
                const diffMs    = ((nh * 60 + nm) - nowMin) * 60000 - mvNow.getUTCSeconds() * 1000;
                document.getElementById('heroCountdown').textContent = formatCountdown(diffMs);

                const afterCard = findAfterNext(next.key);
                if (afterCard) {
                    const afterKey = afterCard.dataset.prayer;
                    document.getElementById('heroAfter').textContent =
                        'Then: ' + (PRAYER_NAMES_EN[afterKey] ?? afterKey) + ' at ' + afterCard.dataset.time;
                } else {
                    document.getElementById('heroAfter').textContent = '';
                }
            } else {
                if (!window._tomorrowFajrFetched) {
                    window._tomorrowFajrFetched = true;
                    const islandId = {{ $viewModel->selectedIsland?->id ?? 'null' }};
                    if (islandId) {
                        const tmrwMV  = getMVT();
                        tmrwMV.setUTCDate(tmrwMV.getUTCDate() + 1);
                        const tmrwStr = tmrwMV.getUTCFullYear() + '-' +
                            String(tmrwMV.getUTCMonth() + 1).padStart(2, '0') + '-' +
                            String(tmrwMV.getUTCDate()).padStart(2, '0');
                        fetch('/api/prayer-times?island_id=' + islandId + '&date=' + tmrwStr)
                            .then(r => r.json())
                            .then(data => { window._tomorrowFajrTime = data?.prayers?.fajr ?? null; })
                            .catch(() => {});
                    }
                }

                if (window._tomorrowFajrTime) {
                    if (heroBox) heroBox.style.opacity = '1';
                    document.getElementById('heroName').textContent = PRAYER_NAMES_DV['fajr'];
                    document.getElementById('heroTime').textContent = PRAYER_NAMES_EN['fajr'] + ' — ' + window._tomorrowFajrTime + ' · Tomorrow';
                    const [fh, fm] = window._tomorrowFajrTime.split(':').map(Number);
                    const minsToMidnight = (24 * 60) - nowMin;
                    const diffMs = (minsToMidnight + fh * 60 + fm) * 60000 - mvNow.getUTCSeconds() * 1000;
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
