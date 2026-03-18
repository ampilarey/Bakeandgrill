@php
    $siteName    = \App\Models\SiteSetting::get('site_name',        'Bake & Grill');
    $siteTagline = \App\Models\SiteSetting::get('site_tagline',     'Authentic Dhivehi cuisine, artisan pastries, and expertly grilled specialties — freshly made every day in the heart of Malé.');
    $metaTitle   = \App\Models\SiteSetting::get('meta_title',       $siteName . ' – Café & Online Orders');
    $metaDesc    = \App\Models\SiteSetting::get('meta_description',  'Fresh Dhivehi food, artisan baking, and premium grills in Malé.');
    $ogImage     = \App\Models\SiteSetting::get('og_image',          asset('logo.png'));
    $logoUrl     = \App\Models\SiteSetting::get('logo',              asset('logo.png'));
    $phone       = \App\Models\SiteSetting::get('business_phone',   '+960 912 0011');
    $email       = \App\Models\SiteSetting::get('business_email',   'hello@bakeandgrill.mv');
    $address     = \App\Models\SiteSetting::get('business_address', 'Kalaafaanu Hingun, Malé, Maldives');
    $landmark    = \App\Models\SiteSetting::get('business_landmark','Near H. Sahara');
    $mapsUrl     = \App\Models\SiteSetting::get('business_maps_url','https://maps.google.com/?q=Kalaafaanu+Hingun+Male+Maldives');
    $waLink      = \App\Models\SiteSetting::get('business_whatsapp','https://wa.me/9609120011');
    $viberLink   = \App\Models\SiteSetting::get('business_viber',   'viber://chat?number=9609120011');
    $phoneTel    = 'tel:' . preg_replace('/[^+\d]/', '', $phone);
@endphp
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>@yield('title', $metaTitle)</title>
    <meta name="description" content="@yield('description', $metaDesc)">
    <meta name="keywords" content="Bake and Grill, food delivery Maldives, Male restaurant, cafe, grills, online order">
    <meta name="author" content="Bake &amp; Grill">

    <!-- Open Graph -->
    <meta property="og:type" content="restaurant">
    <meta property="og:site_name" content="{{ e($siteName) }}">
    <meta property="og:title" content="@yield('title', e($metaTitle))">
    <meta property="og:description" content="@yield('description', e($metaDesc))">
    <meta property="og:image" content="{{ $ogImage }}">
    <meta property="og:url" content="{{ url()->current() }}">
    <meta name="twitter:card" content="summary">

    <!-- Structured Data (JSON-LD) -->
    <script type="application/ld+json">
    {
      "@@context": "https://schema.org",
      "@@type": "Restaurant",
      "name": "{{ e($siteName) }}",
      "description": "{{ e($metaDesc) }}",
      "url": "{{ url('/') }}",
      "logo": "{{ $logoUrl }}",
      "address": {
        "@@type": "PostalAddress",
        "addressLocality": "Malé",
        "addressCountry": "MV"
      },
      "servesCuisine": ["Maldivian", "Grills", "Bakery"],
      "hasMenu": "{{ url('/order') }}",
      "acceptsReservations": true
    }
    </script>

    <link rel="icon" type="image/png" href="{{ \App\Models\SiteSetting::get('favicon', asset('logo.png')) }}">
    <link rel="alternate icon" href="{{ asset('favicon.ico') }}">
    <link rel="apple-touch-icon" href="{{ $logoUrl }}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">

    @verbatim
    <style>
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

        :root {
            --amber:        #D4813A;
            --amber-hover:  #B86820;
            --amber-light:  #FEF3E8;
            --amber-glow:   rgba(212, 129, 58, 0.22);
            --dark:         #1C1408;
            --surface:      #FFFFFF;
            --bg:           #FFFDF9;
            --border:       #EDE4D4;
            --text:         #2A1E0C;
            --muted:        #8B7355;
            --success-bg:   #D6F0E2;
            --success-text: #195C36;
            --danger-bg:    #FCE4E1;
            --danger-text:  #8C1C0E;
        }

        html { scroll-behavior: smooth; }

        body {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--bg);
            color: var(--text);
            line-height: 1.6;
            -webkit-font-smoothing: antialiased;
        }

        a { text-decoration: none; color: inherit; }

        /* ─── Desktop Header ─────────────────────────────────────── */
        .site-header {
            position: sticky;
            top: 0;
            z-index: 300;
            background: rgba(255, 253, 249, 0.92);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border-bottom: 1px solid var(--border);
            transition: box-shadow 0.2s;
        }
        .site-header.scrolled { box-shadow: 0 4px 24px rgba(28, 20, 8, 0.08); }

        .header-inner {
            max-width: 1280px;
            margin: 0 auto;
            padding: 0 2rem;
            height: 68px;
            display: flex;
            align-items: center;
            gap: 1.5rem;
        }

        .site-logo {
            display: flex;
            align-items: center;
            gap: 0.6rem;
            font-size: 1.2rem;
            font-weight: 800;
            color: var(--dark);
            flex-shrink: 0;
            letter-spacing: -0.02em;
        }
        .site-logo img { width: 38px; height: 38px; border-radius: 9px; }

        .header-nav {
            display: flex;
            gap: 0.125rem;
            align-items: center;
            flex: 1;
            margin-left: 0.75rem;
        }
        .header-nav a {
            padding: 0.5rem 0.875rem;
            border-radius: 8px;
            font-weight: 500;
            font-size: 0.925rem;
            color: var(--muted);
            transition: all 0.15s;
        }
        .header-nav a:hover,
        .header-nav a.active { background: var(--amber-light); color: var(--amber); }

        .header-actions {
            display: flex;
            align-items: center;
            gap: 0.625rem;
            flex-shrink: 0;
        }

        .hdr-login {
            padding: 0.45rem 0.875rem;
            border-radius: 8px;
            font-weight: 500;
            font-size: 0.875rem;
            color: var(--muted);
            transition: color 0.15s;
        }
        .hdr-login:hover { color: var(--text); }
        .hdr-logout-btn {
            background: none;
            border: none;
            cursor: pointer;
            padding: 0.45rem 0.875rem;
            border-radius: 8px;
            font-weight: 500;
            font-size: 0.875rem;
            color: var(--muted);
            font-family: inherit;
            transition: color 0.15s;
        }
        .hdr-logout-btn:hover { color: var(--text); }

        .hdr-order {
            padding: 0.55rem 1.25rem;
            background: var(--amber);
            color: white;
            border-radius: 10px;
            font-weight: 700;
            font-size: 0.9rem;
            transition: all 0.15s;
            box-shadow: 0 2px 10px var(--amber-glow);
        }
        .hdr-order:hover {
            background: var(--amber-hover);
            transform: translateY(-1px);
            box-shadow: 0 4px 14px var(--amber-glow);
        }

        /* ─── Status Badge (shared) ──────────────────────────────── */
        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0.35rem 0.875rem;
            border-radius: 999px;
            font-size: 0.8rem;
            font-weight: 600;
        }
        .status-badge.open  { background: var(--success-bg); color: var(--success-text); }
        .status-badge.closed { background: var(--danger-bg);  color: var(--danger-text); }

        /* ─── Mobile Header (top bar) ───────────────────────────── */
        .mobile-header {
            display: none;
            position: sticky;
            top: 0;
            z-index: 300;
            background: rgba(255, 253, 249, 0.96);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border-bottom: 1px solid var(--border);
            padding: 0.75rem 1rem;
        }
        .mob-hdr-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .mob-logo {
            display: flex;
            align-items: center;
            gap: 0.45rem;
            font-size: 1.05rem;
            font-weight: 800;
            color: var(--dark);
            letter-spacing: -0.02em;
        }
        .mob-logo img { width: 32px; height: 32px; border-radius: 7px; }
        .mob-hdr-btns { display: flex; align-items: center; gap: 0.5rem; }
        .mob-order-btn {
            padding: 0.45rem 0.875rem;
            background: var(--amber);
            color: white;
            border-radius: 8px;
            font-weight: 700;
            font-size: 0.8rem;
        }

        /* ─── Mobile Bottom Nav ─────────────────────────────────── */
        .mobile-bottom-nav {
            display: none;
            position: fixed;
            bottom: 0; left: 0; right: 0;
            z-index: 300;
            background: rgba(255, 253, 249, 0.97);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border-top: 1px solid var(--border);
            box-shadow: 0 -2px 12px rgba(0,0,0,0.07);
            padding: 0.5rem 0.5rem;
            padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
        }
        .mob-nav-grid {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 0.25rem;
        }
        .mob-nav-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.2rem;
            padding: 0.4rem 0.2rem;
            border-radius: 10px;
            color: var(--muted);
            font-size: 0.6rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            text-decoration: none;
            cursor: pointer;
            transition: all 0.15s;
            -webkit-tap-highlight-color: transparent;
        }
        .mob-nav-item:hover,
        .mob-nav-item.active { color: var(--amber); }
        .mob-nav-icon { font-size: 1.3rem; line-height: 1; }
        .mob-nav-order {
            background: var(--amber);
            color: white !important;
            border-radius: 12px;
        }
        .mob-nav-order:hover { background: var(--amber-hover); }

        /* ─── Footer ────────────────────────────────────────────── */
        .site-footer {
            background: var(--dark);
            color: white;
            padding: 4rem 2rem 2rem;
            margin-top: 5rem;
        }
        .footer-grid {
            max-width: 1280px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: 2fr 1fr 1fr 1fr;
            gap: 3rem;
            padding-bottom: 3rem;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .footer-brand-logo {
            display: flex;
            align-items: center;
            gap: 0.6rem;
            font-size: 1.2rem;
            font-weight: 800;
            color: white;
            letter-spacing: -0.02em;
            margin-bottom: 1rem;
            text-decoration: none;
        }
        .footer-brand-logo img { width: 36px; height: 36px; border-radius: 8px; }
        .footer-brand p {
            color: rgba(255,255,255,0.55);
            font-size: 0.9rem;
            line-height: 1.7;
            margin-bottom: 1.5rem;
            max-width: 280px;
        }
        .footer-chat-btns {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
        }
        .footer-wa, .footer-viber {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0.55rem 1.125rem;
            color: white;
            border-radius: 10px;
            font-weight: 700;
            font-size: 0.825rem;
            text-decoration: none;
            transition: all 0.15s;
        }
        .footer-wa    { background: #25D366; }
        .footer-wa:hover { background: #1bba58; transform: translateY(-1px); }
        .footer-viber { background: #7360F2; }
        .footer-viber:hover { background: #5E4CD6; transform: translateY(-1px); }
        .footer-col h4 {
            font-size: 0.7rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: rgba(255,255,255,0.35);
            margin-bottom: 1.25rem;
        }
        .footer-col a,
        .footer-col p {
            display: block;
            color: rgba(255,255,255,0.65);
            font-size: 0.875rem;
            margin-bottom: 0.625rem;
            text-decoration: none;
            transition: color 0.15s;
        }
        .footer-col a:hover { color: white; }
        .footer-legal {
            margin-top: 0.875rem;
            padding-top: 0.875rem;
            border-top: 1px solid rgba(255,255,255,0.08);
            display: flex;
            flex-direction: column;
            gap: 0.35rem;
        }
        .footer-legal a {
            color: rgba(255,255,255,0.3) !important;
            font-size: 0.8rem !important;
            margin-bottom: 0 !important;
        }
        .footer-legal a:hover { color: white !important; }
        .footer-legal-staff {
            color: rgba(255,255,255,0.15) !important;
            font-size: 0.75rem !important;
            margin-top: 0.25rem !important;
        }
        .footer-bottom {
            max-width: 1280px;
            margin: 0 auto;
            padding-top: 1.5rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            color: rgba(255,255,255,0.35);
            font-size: 0.8rem;
            flex-wrap: wrap;
            gap: 0.75rem;
        }

        /* ─── Prayer Time Pill (desktop) ───────────────────────── */
        .hdr-prayer-pill {
            display: none;
            align-items: center;
            gap: 0.22rem;
            padding: 0.28rem 0.6rem 0.28rem 0.45rem;
            border: 1px solid var(--border);
            border-radius: 999px;
            font-size: 0.76rem;
            color: var(--text);
            background: var(--surface);
            white-space: nowrap;
            transition: border-color 0.15s;
            flex-shrink: 0;
        }
        .hdr-prayer-pill.pt-loaded { display: inline-flex; }
        .hdr-prayer-pill:hover { border-color: var(--amber); }
        .pt-pill-div   { color: var(--border); margin: 0 0.08rem; }
        .pt-pill-prayer { font-weight: 700; }
        .pt-pill-ptime  { color: var(--amber); font-weight: 600; }
        .pt-pill-cd     { color: var(--muted); font-size: 0.7rem; }
        .pt-pill-clock  { color: var(--muted); }
        .pt-pill-info   { display: flex; align-items: center; gap: 0.22rem; text-decoration: none; color: inherit; }
        .pt-pill-info:hover .pt-pill-prayer { color: var(--amber); }

        /* ─── Geo + island buttons (shared pill/strip) ──────────── */
        .pt-geo-btn {
            background: none; border: none; cursor: pointer;
            padding: 0.18rem 0.25rem; color: var(--muted);
            display: flex; align-items: center;
            border-radius: 5px; transition: color 0.15s; flex-shrink: 0;
        }
        .pt-geo-btn:hover { color: var(--amber); }
        .pt-geo-btn svg { width: 12px; height: 12px; display: block; }
        .pt-geo-btn.pt-spin svg { animation: ptSpin 1s linear infinite; }
        .pt-isl-btn {
            background: none; border: none; cursor: pointer;
            display: flex; align-items: center; gap: 0.18rem;
            color: var(--muted); font-size: 0.76rem; font-weight: 600;
            font-family: inherit; padding: 0.18rem 0.25rem;
            border-radius: 5px; transition: color 0.15s, background 0.15s;
            white-space: nowrap;
        }
        .pt-isl-btn:hover { color: var(--amber); background: var(--amber-light); }
        .pt-isl-arrow { font-size: 0.5rem; opacity: 0.55; }
        @keyframes ptSpin { to { transform: rotate(360deg); } }

        /* ─── Floating island dropdown ───────────────────────────── */
        .hpt-panel {
            position: fixed;
            background: var(--surface);
            border: 1.5px solid var(--amber);
            border-radius: 14px;
            z-index: 9999;
            display: none;
            flex-direction: column;
            width: 290px;
            max-height: 380px;
            box-shadow: 0 16px 48px rgba(28,20,8,0.14);
            overflow: hidden;
        }
        .hpt-panel.open { display: flex; }
        .hpt-search-row {
            padding: 0.6rem 0.75rem;
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
        }
        .hpt-search-input {
            width: 100%; border: 1px solid var(--border); border-radius: 8px;
            padding: 0.4rem 0.65rem; font-size: 0.85rem; font-family: inherit;
            color: var(--text); background: var(--bg); outline: none;
            transition: border-color 0.15s;
        }
        .hpt-search-input:focus { border-color: var(--amber); }
        .hpt-list { overflow-y: auto; flex: 1; }
        .hpt-group-label {
            padding: 0.45rem 0.9rem 0.25rem;
            font-size: 0.67rem; font-weight: 700; letter-spacing: 0.07em;
            text-transform: uppercase; color: var(--amber);
            background: var(--surface); position: sticky; top: 0;
            border-bottom: 1px solid var(--border);
        }
        .hpt-option {
            padding: 0.42rem 0.9rem; cursor: pointer;
            font-size: 0.83rem; color: var(--text);
            transition: background 0.1s;
        }
        .hpt-option:hover { background: var(--amber-light); color: var(--amber); }
        .hpt-option.selected { color: var(--amber); font-weight: 600; }
        .hpt-no-results { padding: 1.5rem; text-align: center; color: var(--muted); font-size: 0.85rem; }

        /* ─── Prayer Strip (mobile only) ────────────────────────── */
        .mob-prayer-strip {
            display: none;
            background: var(--surface);
            border-bottom: 1px solid var(--border);
            padding: 0.4rem 1rem;
            gap: 0.4rem;
            align-items: center;
            justify-content: space-between;
            font-size: 0.76rem;
            color: var(--text);
        }
        .mob-prayer-strip.pt-loaded { display: flex; }
        .pt-strip-controls { display: flex; align-items: center; gap: 0.15rem; }
        .pt-strip-info { display: flex; align-items: center; gap: 0.22rem; text-decoration: none; color: inherit; flex-wrap: wrap; justify-content: flex-end; }
        .pt-strip-info:active { color: var(--amber); }
        .pt-strip-prayer { font-weight: 700; }
        .pt-strip-ptime  { color: var(--amber); font-weight: 600; }
        .pt-strip-cd     { color: var(--muted); font-size: 0.7rem; }
        .pt-strip-div    { color: var(--border); }
        .pt-strip-clock  { color: var(--muted); font-size: 0.7rem; }
        @media (min-width: 769px) { .mob-prayer-strip { display: none !important; } }

        /* ─── Responsive ─────────────────────────────────────────── */
        @media (max-width: 768px) {
            .site-header   { display: none; }
            .mobile-header { display: block; }
            .mobile-bottom-nav { display: block; }
            .site-footer   { padding-bottom: calc(2rem + 72px); margin-top: 3rem; }
            .footer-grid   { grid-template-columns: 1fr 1fr; gap: 2rem; }
            .footer-brand  { grid-column: 1 / -1; }
            .footer-brand p { max-width: 100%; }
            .footer-bottom { flex-direction: column; text-align: center; }
        }
        @media (max-width: 480px) {
            .footer-grid { grid-template-columns: 1fr; }
        }

        /* ─── Shared Utility ─────────────────────────────────────── */
        .container { max-width: 1280px; margin: 0 auto; padding: 0 2rem; }
        @media (max-width: 768px) { .container { padding: 0 1rem; } }
    </style>
    @endverbatim

    @yield('styles')

    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const hdr = document.querySelector('.site-header');
            if (hdr) window.addEventListener('scroll', () => hdr.classList.toggle('scrolled', scrollY > 10), { passive: true });
            const path = location.pathname;
            document.querySelectorAll('.header-nav a, .mob-nav-item[href]').forEach(a => {
                const h = a.getAttribute('href');
                if (h === path || (h && h !== '/' && path.startsWith(h))) a.classList.add('active');
            });
        });
    </script>
</head>
<body>

{{-- ─── Desktop Header ─────────────────────────────────────────── --}}
<header class="site-header">
    <div class="header-inner">
        <a href="/" class="site-logo">
            <img src="{{ $logoUrl }}" alt="{{ $siteName }}">
            <span>{{ $siteName }}</span>
        </a>
        <nav class="header-nav">
            <a href="/">Home</a>
            <a href="/hours">Hours</a>
            <a href="/contact">Contact</a>
        </nav>
        <div class="header-actions">
            {{-- Prayer time pill --}}
            <div id="ptPill" class="hdr-prayer-pill" aria-label="Prayer times">
                {{-- GPS button --}}
                <button type="button" id="ptGeoBtn" class="pt-geo-btn" title="Detect my location">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
                        <circle cx="12" cy="12" r="8" opacity=".18"/>
                    </svg>
                </button>
                {{-- Island selector button --}}
                <button type="button" id="ptIslBtn" class="pt-isl-btn">
                    <span id="ptPillLoc">K. Malé</span>
                    <span class="pt-isl-arrow">▾</span>
                </button>
                {{-- Prayer info (links to prayer-times page) --}}
                <a href="/prayer-times" class="pt-pill-info">
                    <span class="pt-pill-div">·</span>
                    <span class="pt-pill-prayer" id="ptPillPrayer"></span>
                    <span class="pt-pill-ptime" id="ptPillPTime"></span>
                    <span class="pt-pill-cd" id="ptPillCd"></span>
                    <span class="pt-pill-div">·</span>
                    <span class="pt-pill-clock" id="ptPillClock"></span>
                </a>
            </div>
            @if(session('customer_id'))
                <span style="font-size:0.875rem;color:var(--muted);font-weight:500;">Hi, {{ str_replace('+960', '', session('customer_name')) }}</span>
                <form method="POST" action="{{ route('customer.logout') }}" style="display:inline;">
                    @csrf
                    <button type="submit" class="hdr-logout-btn">Logout</button>
                </form>
            @else
                <a href="/customer/login" class="hdr-login">Login</a>
            @endif
            <a href="/order/" class="hdr-order">Order Now →</a>
        </div>
    </div>
</header>

{{-- ─── Mobile Top Bar ──────────────────────────────────────────── --}}
<div class="mobile-header">
    <div class="mob-hdr-row">
        <a href="/" class="mob-logo">
            <img src="{{ $logoUrl }}" alt="{{ $siteName }}">
            <span>{{ $siteName }}</span>
        </a>
        <div class="mob-hdr-btns">
            @if(session('customer_id'))
                <span style="font-size:0.75rem;color:var(--muted);font-weight:500;">Hi, {{ str_replace('+960', '', session('customer_name')) }}</span>
            @else
                <a href="/customer/login" style="font-size:0.8rem;color:var(--muted);font-weight:500;padding:0.4rem 0.75rem;">Login</a>
            @endif
            <a href="/order/" class="mob-order-btn">Order Now</a>
        </div>
    </div>
</div>

{{-- Prayer time strip (mobile only — between header and page content) --}}
<div id="ptStrip" class="mob-prayer-strip" aria-label="Prayer times">
    <div class="pt-strip-controls">
        <button type="button" id="ptGeoBtn2" class="pt-geo-btn" title="Detect my location">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
                <circle cx="12" cy="12" r="8" opacity=".18"/>
            </svg>
        </button>
        <button type="button" id="ptIslBtn2" class="pt-isl-btn">
            <span id="ptStripLoc">K. Malé</span>
            <span class="pt-isl-arrow">▾</span>
        </button>
    </div>
    <a href="/prayer-times" class="pt-strip-info">
        <span class="pt-strip-prayer" id="ptStripPrayer"></span>
        <span class="pt-strip-ptime" id="ptStripPTime"></span>
        <span class="pt-strip-cd" id="ptStripCd"></span>
        <span class="pt-strip-div">·</span>
        <span class="pt-strip-clock" id="ptStripClock"></span>
    </a>
</div>

@yield('content')

{{-- ─── Footer ──────────────────────────────────────────────────── --}}
<footer class="site-footer">
    <div class="footer-grid">
        <div class="footer-brand">
            <a href="/" class="footer-brand-logo">
                <img src="{{ $logoUrl }}" alt="{{ $siteName }}">
                {{ $siteName }}
            </a>
            <p>{{ $siteTagline }}</p>
            <div class="footer-chat-btns">
                <a href="{{ $waLink }}" target="_blank" rel="noopener" class="footer-wa">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    WhatsApp
                </a>
                <a href="{{ $viberLink }}" class="footer-viber">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.4 0C5.7.3 1.2 4.8.9 10.5c-.2 3.4.8 6.5 2.7 8.9L2.2 24l4.8-1.4c1.4.7 3 1.1 4.7 1.1 6.1 0 11.1-5 11.1-11.1S17.9 0 11.8 0h-.4zm.5 2c5.1 0 9.1 4 9.1 9.1s-4 9.1-9.1 9.1c-1.6 0-3.2-.4-4.5-1.2l-.3-.2-3 .9.9-2.9-.2-.3C3.7 15.2 3.1 13.1 3.1 11 3.1 5.9 7.2 2 12.1 2h-.2zm-.8 3.2c-.3 0-.8.1-1.2.5C9.5 6.3 8.8 7 8.8 8.5s1 3 1.2 3.2c.2.2 2 3 4.8 4.2.7.3 1.2.4 1.6.5.7.2 1.3.1 1.8-.1.5-.3 1.6-1.5 1.8-2.3.2-.7.1-1.3-.1-1.5-.1-.2-.4-.3-.8-.5s-2.3-1.1-2.6-1.2c-.3-.1-.6-.2-.8.2-.2.3-.9 1.1-1.1 1.3-.2.2-.4.2-.7.1-.3-.1-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.2-.2.4-.4.5-.6.2-.2.2-.4.3-.6.1-.2 0-.4-.1-.6-.1-.1-.8-1.9-1.1-2.7-.2-.5-.5-.5-.7-.5z"/></svg>
                    Viber
                </a>
            </div>
        </div>
        <div class="footer-col">
            <h4>Quick Links</h4>
            <a href="/">Home</a>
            <a href="/order/menu">Order Online</a>
            <a href="/order/pre-order">Pre-Order (Events)</a>
            <a href="/hours">Opening Hours</a>
            <a href="/contact">Contact Us</a>
        </div>
        <div class="footer-col">
            <h4>Location</h4>
            <p>{{ $address }}</p>
            <p>{{ $landmark }}</p>
            <a href="{{ $mapsUrl }}" target="_blank" rel="noopener">📍 Get directions</a>
        </div>
        <div class="footer-col">
            <h4>Contact</h4>
            <a href="{{ $phoneTel }}">📞 {{ $phone }}</a>
            <a href="mailto:{{ $email }}">✉ {{ $email }}</a>
            <div class="footer-legal">
                <a href="/order/privacy">Privacy Policy</a>
                <a href="/terms">Terms &amp; Conditions</a>
                <a href="/refund">Refund Policy</a>
                <a href="/admin" class="footer-legal-staff">Staff Dashboard</a>
            </div>
        </div>
    </div>
    <div class="footer-bottom">
        <span>© {{ date('Y') }} {{ $siteName }}. All rights reserved.</span>
        <span>Malé, Maldives</span>
    </div>
</footer>

{{-- ─── Mobile Bottom Navigation ────────────────────────────────── --}}
<nav class="mobile-bottom-nav">
    <div class="mob-nav-grid">
        <a href="/" class="mob-nav-item">
            <span class="mob-nav-icon">🏠</span>Home
        </a>
        <a href="/order/menu" class="mob-nav-item">
            <span class="mob-nav-icon">🍽️</span>Menu
        </a>
        <a href="/order/" class="mob-nav-item mob-nav-order">
            <span class="mob-nav-icon">🛒</span>Order
        </a>
        <a href="/hours" class="mob-nav-item">
            <span class="mob-nav-icon">🕐</span>Hours
        </a>
        <a href="/contact" class="mob-nav-item">
            <span class="mob-nav-icon">📞</span>Contact
        </a>
    </div>
</nav>

{{-- Shared floating island dropdown (used by both pill and strip) --}}
<div id="hptPanel" class="hpt-panel" role="listbox" aria-label="Select island">
    <div class="hpt-search-row">
        <input type="text" id="hptSearch" class="hpt-search-input" placeholder="Search island or atoll…" autocomplete="off" spellcheck="false">
    </div>
    <div class="hpt-list" id="hptList"></div>
</div>

<script>
(function () {
    'use strict';

    /* ── Constants ──────────────────────────────────────────────────────── */
    var PRAYERS   = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
    var PRAYER_EN = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
    var ATOLL_ABBR = {
        'Haa Alif':'HA','Haa Dhaalu':'HDh','Shaviyani':'Sh','Noonu':'N','Raa':'R',
        'Baa':'B','Lhaviyani':'Lh','Kaafu':'K','Alif Alif':'AA','Alif Dhaalu':'ADh',
        'Vaavu':'V','Meemu':'M','Faafu':'F','Dhaalu':'Dh','Thaa':'Th','Laamu':'L',
        'Gaafu Alif':'GA','Gaafu Dhaalu':'GDh','Gnaviyani':'Gn','Seenu':'S','Malé':'K',
    };

    /* ── Time helpers ───────────────────────────────────────────────────── */
    function getMVT()    { return new Date(Date.now() + 5 * 3600 * 1000); }
    function parseHHMM(s){ var p=s.split(':'); return +p[0]*60 + +p[1]; }

    function mvtDateStr() {
        var d=getMVT();
        return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
    }

    function fmtCountdown(ms) {
        var t=Math.max(0,Math.floor(ms/1000)), h=Math.floor(t/3600), m=Math.floor((t%3600)/60), s=t%60;
        if (h>0) return h+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
        return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
    }

    function fmtClock(d) {
        var h24=d.getUTCHours(), h12=h24%12||12, m=String(d.getUTCMinutes()).padStart(2,'0');
        var days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        var months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return String(h12).padStart(2,'0')+':'+m+(h24>=12?' PM':' AM')+'  ·  '+days[d.getUTCDay()]+' '+d.getUTCDate()+' '+months[d.getUTCMonth()];
    }

    function makeLabel(atollLatin, nameLatin) {
        var abbr = ATOLL_ABBR[atollLatin] || (atollLatin ? atollLatin.split(' ')[0] : '');
        return (abbr ? abbr+'. ' : '') + (nameLatin || '');
    }

    /* ── DOM helpers ────────────────────────────────────────────────────── */
    function $$(id)        { return document.getElementById(id); }
    function setText(id,v) { var e=$$( id); if(e) e.textContent=v; }

    /* ── State ──────────────────────────────────────────────────────────── */
    var prayers       = null;
    var currentIsland = null;   // { id, atollLatin, nameLatin }
    var allIslands    = [];     // cached flat list
    var tickTimer     = null;
    var dropOpen      = false;
    var activeTrigger = null;

    /* ── Prayer tick ────────────────────────────────────────────────────── */
    function tick() {
        if (!prayers) return;
        var mv=getMVT(), nowMin=mv.getUTCHours()*60+mv.getUTCMinutes();
        var pName='', pTime='', cdStr='';
        for (var i=0; i<PRAYERS.length; i++) {
            var key=PRAYERS[i], pMin=parseHHMM(prayers[key]);
            if (pMin>nowMin) {
                var ms=(pMin-nowMin)*60000-mv.getUTCSeconds()*1000;
                pName=PRAYER_EN[key]; pTime=prayers[key]; cdStr='('+fmtCountdown(ms)+')';
                break;
            }
        }
        if (!pName) { pName='Fajr'; pTime='–'; cdStr='tomorrow'; }
        var clock=fmtClock(mv);
        setText('ptPillPrayer', pName);  setText('ptPillPTime',  pTime);
        setText('ptPillCd',     cdStr);  setText('ptPillClock',  clock);
        setText('ptStripPrayer',pName);  setText('ptStripPTime', pTime);
        setText('ptStripCd',    cdStr);  setText('ptStripClock', clock);
    }

    /* ── Show pill/strip ────────────────────────────────────────────────── */
    function showPill(isl) {
        var label = makeLabel(isl.atollLatin, isl.nameLatin);
        setText('ptPillLoc',  label);
        setText('ptStripLoc', label);
        var pill=$$('ptPill'), strip=$$('ptStrip');
        if (pill)  pill.classList.add('pt-loaded');
        if (strip) strip.classList.add('pt-loaded');
        tick();
        if (!tickTimer) tickTimer = setInterval(tick, 1000);
    }

    /* ── Prayer data ────────────────────────────────────────────────────── */
    function loadPrayers(islandId, cb) {
        var today=mvtDateStr(), cKey='pt_day_'+today+'_'+islandId;
        try { var c=localStorage.getItem(cKey); if(c){ prayers=JSON.parse(c); cb(); return; } } catch(e){}
        fetch('/api/prayer-times?island_id='+islandId+'&date='+today)
            .then(function(r){ return r.json(); })
            .then(function(d){ if(d.prayers){ prayers=d.prayers; try{localStorage.setItem(cKey,JSON.stringify(prayers));}catch(e){} } cb(); })
            .catch(function(){ cb(); });
    }

    /* ── Select island ──────────────────────────────────────────────────── */
    function selectIsland(isl) {
        currentIsland = { id: isl.id, atollLatin: isl.atoll_latin||'', nameLatin: isl.name_latin||isl.name };
        try { localStorage.setItem('pt_island', JSON.stringify(currentIsland)); } catch(e){}
        prayers = null;
        loadPrayers(currentIsland.id, function(){ if(prayers) showPill(currentIsland); });
    }

    /* ── Island dropdown ────────────────────────────────────────────────── */
    function buildList(q) {
        var list=$$('hptList'); if(!list) return;
        list.innerHTML=''; q=(q||'').toLowerCase().trim();
        var groups={}, order=[];
        allIslands.forEach(function(isl){
            var a=isl.atoll_latin||isl.atoll||'–';
            if(!groups[a]){ groups[a]=[]; order.push(a); }
            groups[a].push(isl);
        });
        var any=false;
        order.forEach(function(atoll){
            var vis = q ? groups[atoll].filter(function(i){
                return (i.name_latin||i.name||'').toLowerCase().includes(q) || atoll.toLowerCase().includes(q);
            }) : groups[atoll];
            if(!vis.length) return;
            any=true;
            var lbl=document.createElement('div');
            lbl.className='hpt-group-label';
            lbl.textContent=(ATOLL_ABBR[atoll]||atoll)+'  —  '+atoll;
            list.appendChild(lbl);
            vis.forEach(function(isl){
                var opt=document.createElement('div');
                opt.className='hpt-option'+(currentIsland&&isl.id===currentIsland.id?' selected':'');
                opt.textContent=isl.name_latin||isl.name;
                opt.addEventListener('click', function(e){ e.stopPropagation(); closeDropdown(); selectIsland(isl); });
                list.appendChild(opt);
            });
        });
        if(!any){ var nr=document.createElement('div'); nr.className='hpt-no-results'; nr.textContent='No islands found'; list.appendChild(nr); }
    }

    function openDropdown(trigger) {
        var panel=$$('hptPanel'); if(!panel) return;
        var r=trigger.getBoundingClientRect();
        var pw=290;
        var left=r.left;
        if (left+pw > window.innerWidth-8) left=window.innerWidth-pw-8;
        panel.style.top  = (r.bottom+6)+'px';
        panel.style.left = left+'px';
        panel.classList.add('open');
        dropOpen=true; activeTrigger=trigger;
        var s=$$('hptSearch'); if(s){ s.value=''; s.focus(); }
        buildList('');
    }

    function closeDropdown() {
        var panel=$$('hptPanel'); if(panel) panel.classList.remove('open');
        dropOpen=false; activeTrigger=null;
    }

    function openIslands(trigger) {
        if (dropOpen && activeTrigger===trigger) { closeDropdown(); return; }
        closeDropdown();
        if (allIslands.length) { openDropdown(trigger); return; }
        try {
            var c=localStorage.getItem('pt_islands_list');
            if(c){ allIslands=JSON.parse(c); openDropdown(trigger); return; }
        } catch(e){}
        fetch('/api/prayer-times/islands')
            .then(function(r){ return r.json(); })
            .then(function(d){
                allIslands=d.islands||[];
                try{ localStorage.setItem('pt_islands_list', JSON.stringify(allIslands)); }catch(e){}
                openDropdown(trigger);
            }).catch(function(){});
    }

    /* ── Geolocation ────────────────────────────────────────────────────── */
    function handleGeo(btn) {
        if (!navigator.geolocation) return;
        btn.classList.add('pt-spin'); btn.disabled=true;
        navigator.geolocation.getCurrentPosition(
            function(pos){
                fetch('/api/prayer-times/nearest?lat='+pos.coords.latitude+'&lng='+pos.coords.longitude)
                    .then(function(r){ return r.json(); })
                    .then(function(d){
                        btn.classList.remove('pt-spin'); btn.disabled=false;
                        if(d.island){ try{localStorage.removeItem('pt_island');}catch(e){} selectIsland(d.island); }
                    })
                    .catch(function(){ btn.classList.remove('pt-spin'); btn.disabled=false; });
            },
            function(){ btn.classList.remove('pt-spin'); btn.disabled=false; },
            { timeout: 8000 }
        );
    }

    /* ── Wire events ────────────────────────────────────────────────────── */
    function wireEvents() {
        ['ptGeoBtn','ptGeoBtn2'].forEach(function(id){
            var b=$$( id); if(b) b.addEventListener('click', function(e){ e.stopPropagation(); handleGeo(b); });
        });
        ['ptIslBtn','ptIslBtn2'].forEach(function(id){
            var b=$$( id); if(b) b.addEventListener('click', function(e){ e.stopPropagation(); openIslands(b); });
        });
        var s=$$('hptSearch');
        if(s){
            s.addEventListener('input',  function(){ buildList(s.value); });
            s.addEventListener('click',  function(e){ e.stopPropagation(); });
        }
        var panel=$$('hptPanel');
        if(panel) panel.addEventListener('click', function(e){ e.stopPropagation(); });
        document.addEventListener('click',   function(){ if(dropOpen) closeDropdown(); });
        document.addEventListener('keydown', function(e){ if(e.key==='Escape') closeDropdown(); });
    }

    /* ── Init ───────────────────────────────────────────────────────────── */
    function init() {
        wireEvents();
        var isl=null;
        try{ var s=localStorage.getItem('pt_island'); if(s) isl=JSON.parse(s); }catch(e){}

        if (isl) {
            currentIsland=isl;
            loadPrayers(isl.id, function(){ if(prayers) showPill(isl); });
            return;
        }

        /* Default: find Malé from the islands list, no location prompt */
        fetch('/api/prayer-times/islands')
            .then(function(r){ return r.json(); })
            .then(function(d){
                allIslands=d.islands||[];
                try{ localStorage.setItem('pt_islands_list', JSON.stringify(allIslands)); }catch(e){}
                var male=allIslands.find(function(i){
                    return (i.name_latin||'').replace(/[^a-zA-Z]/g,'').toLowerCase()==='male';
                });
                if (male) {
                    isl={ id:male.id, atollLatin:male.atoll_latin||'Kaafu', nameLatin:male.name_latin||'Malé' };
                    currentIsland=isl;
                    try{ localStorage.setItem('pt_island', JSON.stringify(isl)); }catch(e){}
                    loadPrayers(isl.id, function(){ if(prayers) showPill(isl); });
                }
            }).catch(function(){});
    }

    if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
</script>
</body>
</html>
