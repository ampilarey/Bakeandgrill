@php
    /* ── Order status bar data ─────────────────────────────── */
    $orderBar = null;
    if (Auth::guard('customer')->check()) {
        $activeStatuses = ['payment_pending', 'pending', 'paid', 'preparing', 'ready'];
        $orderBar = \App\Models\Order::where('customer_id', Auth::guard('customer')->id())
            ->whereIn('status', $activeStatuses)
            ->orderBy('created_at', 'desc')
            ->first(['id', 'order_number', 'status'])
            ?? \App\Models\Order::where('customer_id', Auth::guard('customer')->id())
            ->orderBy('created_at', 'desc')
            ->first(['id', 'order_number', 'status']);
    }
    $orderBarStatuses = [
        'payment_pending' => ['label' => 'Awaiting payment', 'color' => '#92400e', 'dot' => '#f59e0b', 'active' => true],
        'pending'         => ['label' => 'Payment received',  'color' => '#1e40af', 'dot' => '#3b82f6', 'active' => true],
        'paid'            => ['label' => 'Confirmed',          'color' => '#065f46', 'dot' => '#10b981', 'active' => true],
        'preparing'       => ['label' => 'Being prepared',     'color' => '#1e40af', 'dot' => '#3b82f6', 'active' => true],
        'ready'           => ['label' => 'Ready for pickup',   'color' => '#065f46', 'dot' => '#10b981', 'active' => true],
        'completed'       => ['label' => 'Completed',          'color' => '#374151', 'dot' => '#9ca3af', 'active' => false],
        'cancelled'       => ['label' => 'Cancelled',          'color' => '#991b1b', 'dot' => '#ef4444', 'active' => false],
    ];
    $orderBarMeta = $orderBar ? ($orderBarStatuses[$orderBar->status] ?? ['label' => $orderBar->status, 'color' => '#374151', 'dot' => '#9ca3af', 'active' => false]) : null;
    $orderBarLink = $orderBar
        ? ($orderBarMeta['active'] ? '/order/orders/' . $orderBar->id : '/order/order-history')
        : null;

    $siteName    = content('site_name',        'Bake & Grill');
    $siteTagline = content('site_tagline',     'Authentic Dhivehi cuisine, artisan pastries, and expertly grilled specialties — freshly made every day in the heart of Malé.');
    $metaTitle   = content('meta_title',       $siteName . ' – Café & Online Orders');
    $metaDesc    = content('meta_description',  'Fresh Dhivehi food, artisan baking, and premium grills in Malé.');
    $metaKeywords = content('meta_keywords', 'Bake and Grill, food delivery Maldives, Male restaurant, cafe, grills, online order');
    $ogImage     = content('og_image',          asset('logo.png'));
    $logoUrl     = content('logo',              asset('logo.png'));
    $phone       = content('business_phone',   '+960 912 0011');
    $email       = content('business_email',   'admin@bakeandgrill.mv');
    $address     = content('business_address', 'Kalaafaanu Hingun, Malé, Maldives');
    $landmark    = content('business_landmark','Near H. Sahara');
    $mapsUrl     = content('business_maps_url','https://maps.google.com/?q=Kalaafaanu+Hingun+Male+Maldives');
    $waLink      = content('business_whatsapp','https://wa.me/9609120011');
    $viberLink   = content('business_viber',   'viber://chat?number=9609120011');
    $phoneTel    = 'tel:' . preg_replace('/[^+\d]/', '', $phone);
    $gtmId       = trim((string) content('google_tag_manager_id', ''));
    $gaId        = trim((string) content('google_analytics_id', ''));
    $navOrderCta = content('nav_order_cta_text', 'Order Now →');
    $footerQuickLinksHeading = content('footer_quick_links_heading', 'Quick Links');
    $footerLocationHeading   = content('footer_location_heading', 'Location');
    $footerContactHeading    = content('footer_contact_heading', 'Contact');
    $footerRightsSuffix      = content('footer_rights_suffix', 'All rights reserved.');
    $footerText              = trim(content('footer_text', ''));
    $footerBlurb             = $footerText !== '' ? $footerText : $siteTagline;
    $footerHoursHeading      = content('footer_hours_heading', 'Opening Hours');
    $footerPaymentsText      = content('footer_payments_text', 'BML · Cards · Cash · MVR');
    $footerDeliveryText      = content('footer_delivery_text', 'Delivery across Malé & Hulhumalé');
    $footerThanks            = content('footer_thanks', 'Thanks for choosing Bake & Grill — see you soon.');
    $socialInstagram         = trim((string) content('social_instagram', ''));
    $socialFacebook          = trim((string) content('social_facebook', ''));
    $socialTiktok            = trim((string) content('social_tiktok', ''));
    $openingHoursSvc         = app(\App\Services\OpeningHoursService::class);
    $footerHours             = $openingHoursSvc->getHoursForDisplay();
    $footerHoursToday        = now(config('opening_hours.timezone'))->dayOfWeek;
    $footerDayNames          = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    $footerRamadanActive     = $openingHoursSvc->isRamadanHoursActive();
    $footerRamadanNote       = content('footer_ramadan_note', 'Ramadan hours — open after Maghrib.');
@endphp
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>@yield('title', $metaTitle)</title>
    <meta name="description" content="@yield('description', $metaDesc)">
    <meta name="keywords" content="{{ e($metaKeywords) }}">
    <meta name="author" content="Bake &amp; Grill">

    <!-- Open Graph -->
    <meta property="og:type" content="restaurant">
    <meta property="og:site_name" content="{{ e($siteName) }}">
    <meta property="og:title" content="@yield('title', e($metaTitle))">
    <meta property="og:description" content="@yield('description', e($metaDesc))">
    <meta property="og:image" content="{{ $ogImage }}">
    <meta property="og:url" content="{{ url()->current() }}">

    {{-- BLD-003: Twitter card upgrade. `summary` shows a tiny thumb;
         `summary_large_image` actually shows the OG image when shared
         on X / iMessage / WhatsApp link previews and boosts CTR for
         the menu/specials pages. --}}
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="@yield('title', e($metaTitle))">
    <meta name="twitter:description" content="@yield('description', e($metaDesc))">
    <meta name="twitter:image" content="{{ $ogImage }}">

    {{-- BLD-004: Canonical URL. Without it, the same page reachable
         via /home, /index.php?lang=en, or /?utm_source=fb was getting
         indexed multiple times by Google, splitting page-rank. Use
         the current URL stripped of query string. --}}
    <link rel="canonical" href="{{ url()->current() }}">

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

    <!-- Apply saved theme before first paint to avoid flash -->
    <script nonce="{{ csp_nonce() }}">if(localStorage.getItem('theme')==='dark')document.documentElement.dataset.theme='dark';</script>

    <link rel="icon" type="image/png" href="{{ content('favicon', asset('logo.png')) }}">
    <link rel="alternate icon" href="{{ asset('favicon.ico') }}">
    <link rel="apple-touch-icon" href="{{ $logoUrl }}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">

    @if($gtmId !== '')
    <script nonce="{{ csp_nonce() }}">(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','{{ e($gtmId) }}');</script>
    @elseif($gaId !== '' && str_starts_with($gaId, 'G-'))
    <script async src="https://www.googletagmanager.com/gtag/js?id={{ e($gaId) }}"></script>
    <script nonce="{{ csp_nonce() }}">
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '{{ e($gaId) }}');
    </script>
    @endif

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
            /* Dark bars with light text (hero, proof) — not the same as --dark heading text */
            --inverse-section-bg: #1C1408;
            --surface-alt:  #f7f3ec;
        }

        [data-theme="dark"] {
            --amber:        #e09242;
            --amber-hover:  #c97a2a;
            --amber-light:  rgba(224,146,66,0.15);
            --amber-glow:   rgba(224,146,66,0.22);
            --dark:         #f5e6cc;
            --surface:      #231809;
            --bg:           #1a1208;
            --border:       #3a2a12;
            --text:         #e8d5b5;
            --muted:        #9c8060;
            --success-bg:   #0d2d1a;
            --success-text: #4ade80;
            --danger-bg:    #2d0f0a;
            --danger-text:  #f87171;
            --inverse-section-bg: #0e0a04;
            --surface-alt:  #2a1e0e;
        }
        [data-theme="dark"] .site-header,
        [data-theme="dark"] .mobile-header,
        [data-theme="dark"] .mobile-bottom-nav {
            background: rgba(26, 18, 8, 0.94);
        }
        [data-theme="dark"] .mob-nav-order { background: var(--amber); }
        [data-theme="dark"] .site-announcement--info    { background: rgba(96,165,250,0.1); color: #93c5fd; border-bottom-color: rgba(96,165,250,0.25); }
        [data-theme="dark"] .site-announcement--warning { background: rgba(250,204,21,0.1);  color: #fde047; border-bottom-color: rgba(250,204,21,0.25); }
        [data-theme="dark"] .site-announcement--promo   { background: rgba(74,222,128,0.1);  color: #86efac; border-bottom-color: rgba(74,222,128,0.25); }

        .dark-toggle {
            background: var(--surface);
            border: 1.5px solid var(--border);
            border-radius: 8px;
            width: 40px; height: 40px;
            cursor: pointer;
            font-size: 1rem;
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0;
            transition: background 0.15s, border-color 0.15s;
        }
        .dark-toggle:hover { background: var(--amber-light); border-color: var(--amber); }

        html { scroll-behavior: smooth; scroll-padding-top: 75px; }

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
        .site-header.scrolled .header-inner {
            min-height: 48px;
            padding-block: 0.25rem;
        }
        .site-header.scrolled .site-logo img { width: 32px; height: 32px; }

        /* ─── Announcement Banner ─────────────────────────────────── */
        .site-announcement {
            width: 100%;
            padding: 0.6rem 1.5rem;
            font-size: 0.875rem;
            font-weight: 600;
            text-align: center;
        }
        .site-announcement--info    { background: #eff6ff; color: #1e40af; border-bottom: 1px solid #bfdbfe; }
        .site-announcement--warning { background: #fffbeb; color: #92400e; border-bottom: 1px solid #fcd34d; }
        .site-announcement--promo   { background: #f0fdf4; color: #166534; border-bottom: 1px solid #bbf7d0; }
        .site-announcement__inner {
            display: inline-flex; align-items: center; gap: 0.5rem;
            text-decoration: none; color: inherit;
        }
        .site-announcement__arrow { opacity: 0.7; }

        /* min-height (not height) so expanded prayer can grow — matches order-app .top-nav__inner */
        .header-inner {
            max-width: 1280px;
            margin: 0 auto;
            padding: 0.45rem 2rem;
            min-height: 64px;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            box-sizing: border-box;
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
            gap: 0.15rem;
            align-items: center;
            flex: 0 1 auto;
            margin-left: 0.5rem;
            flex-wrap: nowrap;
            min-width: 0;
        }
        .header-nav a {
            padding: 0.5rem 0.8rem;
            border-radius: 10px;
            font-weight: 600;
            font-size: 0.9rem;
            color: var(--text);
            transition: background 0.15s, color 0.15s;
            text-decoration: none;
            white-space: nowrap;
        }
        .header-nav a:hover,
        .header-nav a.active {
            background: var(--amber-light);
            color: var(--amber);
        }

        /* Prayer strip in header row — matches order-app .top-nav__prayer */
        .header-prayer {
            flex: 1 1 12rem;
            min-width: 0;
            max-width: 28rem;
            margin-left: auto;
            align-self: center;
        }
        .header-prayer .prayer-banner {
            width: 100%;
            margin: 0;
            min-height: 40px;
            background: var(--surface);
        }
        .header-prayer .prayer-banner-summary,
        .header-prayer .prayer-banner-expand,
        .header-prayer .prayer-banner-skeleton,
        .header-prayer .prayer-banner-unavailable {
            min-height: 40px;
        }
        .header-prayer .prayer-banner-next {
            font-size: 0.75rem;
        }
        .header-prayer .prayer-banner-island {
            font-size: 0.6875rem;
            padding: 0.2rem 0.45rem;
        }
        /* Keep logo/nav/actions pinned to the top row while the prayer panel opens downward */
        .header-inner:has(.prayer-banner.is-expanded) {
            align-items: flex-start;
        }
        .header-inner:has(.prayer-banner.is-expanded) .header-prayer {
            align-self: stretch;
        }

        /* Desktop header — matches order-app TopNav layout */
        @media (min-width: 769px) {
            .site-header .header-inner {
                min-height: 64px;
                padding: 0.45rem clamp(1.25rem, 2.5vw, 2.25rem);
                gap: 0.75rem;
            }
            .site-header.scrolled .header-inner {
                min-height: 48px;
                padding-block: 0.25rem;
            }
            .site-logo {
                font-size: 1.28rem;
                gap: 0.7rem;
            }
            .site-logo img {
                width: 42px;
                height: 42px;
                border-radius: 10px;
            }
            .header-nav {
                gap: 0.2rem;
                margin-left: 0.75rem;
            }
            .header-nav a {
                padding: 0.55rem 0.95rem;
                font-size: 0.95rem;
                min-height: 44px;
                display: inline-flex;
                align-items: center;
            }
        }
        @media (min-width: 769px) and (max-width: 1100px) {
            .header-nav a {
                padding: 0.5rem 0.7rem;
                font-size: 0.875rem;
            }
            .header-prayer {
                max-width: 16rem;
            }
            .header-prayer .prayer-banner-island {
                display: none; /* island picker still available when expanded */
            }
        }

        .header-actions {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            flex-shrink: 0;
        }

        .hdr-login,
        .hdr-account {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.35rem;
            min-height: 44px;
            padding: 0.55rem 1.15rem;
            border-radius: 11px;
            border: 1.5px solid var(--border);
            background: var(--surface);
            font-weight: 700;
            font-size: 0.9rem;
            color: var(--text);
            text-decoration: none;
            transition: border-color 0.15s, background 0.15s, color 0.15s, transform 0.15s;
            box-sizing: border-box;
        }
        .hdr-login:hover,
        .hdr-account:hover {
            border-color: var(--amber);
            background: var(--amber-light);
            color: var(--amber);
            transform: translateY(-1px);
        }
        .hdr-logout-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 44px;
            padding: 0.55rem 1rem;
            border-radius: 11px;
            border: 1.5px solid var(--border);
            background: transparent;
            cursor: pointer;
            font-weight: 600;
            font-size: 0.875rem;
            color: var(--muted);
            font-family: inherit;
            transition: border-color 0.15s, color 0.15s, background 0.15s;
        }
        .hdr-logout-btn:hover {
            border-color: var(--border);
            color: var(--text);
            background: var(--surface-alt, #f7f3ec);
        }

        .hdr-order {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.4rem;
            min-height: 48px;
            padding: 0.7rem 1.45rem;
            background: var(--amber);
            color: white;
            border-radius: 12px;
            font-weight: 800;
            font-size: 0.975rem;
            letter-spacing: -0.01em;
            transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
            box-shadow: 0 4px 16px var(--amber-glow);
            white-space: nowrap;
        }
        .hdr-order:hover {
            background: var(--amber-hover);
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(212, 129, 58, 0.4);
        }
        .site-header .dark-toggle {
            width: 44px;
            height: 44px;
            border-radius: 11px;
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
            padding-top: max(0.75rem, env(safe-area-inset-top));
            transition: padding 0.2s ease;
        }
        .mobile-header.scrolled {
            padding: 0.4rem 1rem;
            padding-top: max(0.4rem, env(safe-area-inset-top));
            box-shadow: 0 2px 12px rgba(28, 20, 8, 0.06);
        }
        .mobile-header.scrolled .mob-logo img { width: 28px; height: 28px; }
        .mobile-header.scrolled .mob-logo { font-size: 0.95rem; }
        @media (prefers-reduced-motion: reduce) {
            .mobile-header,
            .site-header.scrolled .header-inner,
            .site-header.scrolled .site-logo img { transition: none; }
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
            min-height: 44px;
            display: inline-flex;
            align-items: center;
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
            z-index: 300; /* matches --z-bottom-nav in React order app */
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
            gap: 0.15rem;
            align-items: end;
            max-width: 520px;
            margin: 0 auto;
        }
        .mob-nav-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 0.15rem;
            padding: 0.35rem 0.2rem;
            border-radius: 10px;
            color: var(--muted);
            font-size: 0.6rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            text-decoration: none;
            cursor: pointer;
            transition: all 0.15s;
            -webkit-tap-highlight-color: transparent;
            min-height: 44px;
            border: none;
            background: none;
            font-family: inherit;
        }
        .mob-nav-item:hover,
        .mob-nav-item.active { color: var(--amber); }
        .mob-nav-icon-svg {
            width: 20px;
            height: 20px;
            flex-shrink: 0;
            display: block;
            color: inherit;
        }
        .mob-nav-icon { font-size: 1.3rem; line-height: 1; }
        /* Raised amber center Order CTA */
        .mob-nav-order {
            position: relative;
            top: -10px;
            background: var(--amber);
            color: white !important;
            border-radius: 16px;
            min-height: 52px;
            box-shadow: 0 6px 16px rgba(212, 129, 58, 0.4);
            font-size: 0.62rem;
        }
        .mob-nav-order .mob-nav-icon-svg {
            width: 22px;
            height: 22px;
        }
        .mob-nav-order:hover,
        .mob-nav-order.active { background: var(--amber-hover); color: white !important; }

        /* ─── Footer ────────────────────────────────────────────── */
        .site-footer {
            background: var(--inverse-section-bg);
            color: white;
            padding: 4rem 2rem 2rem;
            margin-top: 5rem;
        }
        .footer-grid {
            max-width: 1280px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: 1.6fr 1fr 1.15fr 1fr 1fr;
            gap: 2.25rem;
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
        .footer-wa, .footer-viber, .footer-social-icon {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0.55rem 1.125rem;
            min-height: 44px;
            color: white;
            border-radius: 10px;
            font-weight: 700;
            font-size: 0.825rem;
            text-decoration: none;
            transition: all 0.15s;
            box-sizing: border-box;
        }
        .footer-wa    { background: #25D366; }
        .footer-wa:hover { background: #1bba58; transform: translateY(-1px); }
        .footer-viber { background: #7360F2; }
        .footer-viber:hover { background: #5E4CD6; transform: translateY(-1px); }
        .footer-social-icon {
            width: 44px;
            min-width: 44px;
            padding: 0;
            justify-content: center;
            background: rgba(255,255,255,0.1);
        }
        .footer-social-icon:hover { background: rgba(255,255,255,0.2); transform: translateY(-1px); }
        .footer-social-icon svg { width: 18px; height: 18px; display: block; }
        .footer-order-cta {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.35rem;
            margin-top: 1rem;
            min-height: 48px;
            padding: 0.75rem 1.35rem;
            background: var(--amber, #D4813A);
            color: #fff !important;
            border-radius: 12px;
            font-weight: 800;
            font-size: 0.95rem;
            text-decoration: none !important;
            box-shadow: 0 6px 18px rgba(212, 129, 58, 0.35);
        }
        .footer-order-cta:hover { background: var(--amber-hover, #c06f2a); color: #fff !important; }
        .footer-thanks {
            margin: 1rem 0 0;
            color: rgba(255,255,255,0.55);
            font-size: 0.875rem;
            line-height: 1.55;
            max-width: 280px;
        }
        .footer-hours-list {
            display: flex;
            flex-direction: column;
            gap: 0.35rem;
        }
        .footer-hours-row {
            display: flex;
            justify-content: space-between;
            gap: 0.75rem;
            color: rgba(255,255,255,0.65);
            font-size: 0.825rem;
            min-height: 28px;
            align-items: center;
        }
        .footer-hours-row.is-today {
            color: #fff;
            font-weight: 700;
        }
        .footer-hours-row.is-today .footer-hours-day::after {
            content: ' · Today';
            color: var(--amber, #D4813A);
            font-weight: 700;
            font-size: 0.72rem;
        }
        .footer-ramadan-note {
            margin-top: 0.75rem;
            padding: 0.55rem 0.7rem;
            border-radius: 8px;
            background: rgba(212, 129, 58, 0.18);
            color: #fde5d4;
            font-size: 0.78rem;
            line-height: 1.4;
        }
        .footer-trust {
            max-width: 1280px;
            margin: 0 auto 1.25rem;
            padding: 1rem 0 0;
            display: flex;
            flex-wrap: wrap;
            gap: 0.75rem 1.5rem;
            align-items: center;
            color: rgba(255,255,255,0.45);
            font-size: 0.8rem;
        }
        .footer-trust span { display: inline-flex; align-items: center; gap: 0.4rem; }
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
            min-height: 44px;
            line-height: 1.35;
            padding: 0.35rem 0;
            box-sizing: border-box;
        }
        .footer-col p { min-height: 0; padding: 0; margin-bottom: 0.5rem; }
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

        /* ─── Prayer banner (matches order-app PrayerBar) ───────── */
        .site-prayer-wrap--mobile {
            display: none;
            padding: 0.35rem 1rem 0.4rem;
            background: transparent;
            border: none;
        }
        @media (max-width: 768px) {
            .site-prayer-wrap--mobile { display: block; }
        }

        .prayer-banner {
            background: var(--surface-alt, #f7f3ec);
            border: 1px solid var(--border);
            border-radius: 12px;
            min-height: 44px;
            overflow: hidden;
        }
        /* Author display:flex overrides bare [hidden] in some browsers */
        .prayer-banner-skeleton[hidden],
        .prayer-banner-unavailable[hidden],
        .prayer-banner-body[hidden],
        .prayer-banner-panel[hidden] {
            display: none !important;
        }
        .prayer-banner-skeleton {
            height: 44px;
            display: flex;
            align-items: center;
            padding: 0 0.75rem;
        }
        .prayer-banner-skeleton-bar {
            display: block;
            height: 14px;
            width: 55%;
            border-radius: 999px;
            background: linear-gradient(90deg, var(--border) 25%, var(--surface) 50%, var(--border) 75%);
            background-size: 200% 100%;
            animation: ptShimmer 1.2s linear infinite;
        }
        @keyframes ptShimmer {
            0% { background-position: 100% 0; }
            100% { background-position: -100% 0; }
        }
        .prayer-banner-unavailable {
            min-height: 44px;
            display: flex;
            align-items: center;
            padding: 0 0.75rem;
            font-size: 0.8125rem;
            color: var(--muted);
        }
        .prayer-banner-summary {
            display: flex;
            align-items: stretch;
            gap: 0.25rem;
            min-height: 44px;
        }
        .prayer-banner-expand {
            flex: 1;
            min-width: 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.35rem;
            padding: 0.4rem 0.25rem 0.4rem 0.75rem;
            border: none;
            background: transparent;
            cursor: pointer;
            font-family: inherit;
            text-align: left;
            color: var(--text);
            min-height: 44px;
        }
        .prayer-banner-summary-left {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 0.25rem;
            min-width: 0;
        }
        .prayer-banner-island {
            flex-shrink: 0;
            align-self: center;
            margin-right: 0.4rem;
            padding: 0.25rem 0.55rem;
            border: 1px solid var(--border);
            border-radius: 999px;
            background: var(--surface);
            font-family: inherit;
            font-size: 0.75rem;
            font-weight: 700;
            color: var(--text);
            cursor: pointer;
            white-space: nowrap;
        }
        .prayer-banner-next {
            font-size: 0.8125rem;
            color: var(--text);
            line-height: 1.25;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .prayer-banner-next strong {
            font-weight: 800;
            color: var(--dark, var(--text));
        }
        .prayer-banner-time { font-variant-numeric: tabular-nums; }
        .prayer-banner-cd {
            color: var(--muted);
            font-variant-numeric: tabular-nums;
        }
        .prayer-banner-chevron {
            flex-shrink: 0;
            color: var(--muted);
            font-size: 0.75rem;
            padding-right: 0.2rem;
        }
        .prayer-banner-panel {
            border-top: 1px solid var(--border);
            padding: 0.85rem 1rem 1rem;
        }
        .prayer-banner-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.5rem;
        }
        @media (min-width: 390px) {
            .prayer-banner-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        @media (min-width: 640px) {
            .prayer-banner-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
        }
        .prayer-banner-cell {
            display: flex;
            flex-direction: column;
            gap: 0.15rem;
            padding: 0.55rem 0.6rem;
            border-radius: 12px;
            background: var(--surface);
            border: 1px solid transparent;
        }
        .prayer-banner-cell.is-next {
            background: var(--amber-light);
            border-color: rgba(212, 129, 58, 0.35);
        }
        .prayer-banner-cell-name {
            font-size: 0.7rem;
            font-weight: 700;
            color: var(--muted);
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }
        .prayer-banner-cell-time {
            font-size: 0.95rem;
            font-weight: 800;
            color: var(--dark, var(--text));
            font-variant-numeric: tabular-nums;
        }
        .prayer-banner-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin-top: 0.85rem;
        }
        .prayer-banner-action {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            min-height: 36px;
            padding: 0 0.85rem;
            border-radius: 999px;
            border: 1px solid var(--border);
            background: var(--surface);
            color: var(--text);
            font-family: inherit;
            font-size: 0.8125rem;
            font-weight: 700;
            cursor: pointer;
        }
        .prayer-banner-action:disabled { opacity: 0.55; cursor: wait; }
        .prayer-banner-action.pt-spin svg { animation: ptSpin 1s linear infinite; }
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

        /* ─── Order Status Bar ───────────────────────────────────── */
        .order-status-bar {
            display: flex;
            align-items: stretch;
            background: var(--amber-light);
            border-top: 1px solid var(--border);
            font-size: 0.8rem;
            min-height: 36px;
        }
        .order-status-bar--neutral { background: var(--surface); }
        .osb-left-link {
            display: flex; align-items: center; gap: 0.5rem;
            flex: 1; min-width: 0; overflow: hidden;
            padding: 0.4rem 0.75rem 0.4rem 2rem;
            text-decoration: none; color: inherit;
            transition: opacity 0.15s;
        }
        .osb-left-link:hover { opacity: 0.78; }
        .osb-label { font-weight: 700; color: var(--amber); white-space: nowrap; }
        .osb-sep { color: var(--border); flex-shrink: 0; }
        .osb-num { font-weight: 600; color: var(--text); white-space: nowrap; }
        .osb-status { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .osb-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .osb-dot--pulse { animation: osbPulse 2s ease-in-out infinite; }
        @keyframes osbPulse {
            0%, 100% { opacity: 1; }
            50%       { opacity: 0.35; }
        }
        .osb-cta-link {
            flex-shrink: 0; font-weight: 600; color: var(--amber); white-space: nowrap;
            text-decoration: none; padding: 0.4rem 2rem 0.4rem 0.75rem;
            border-left: 1px solid var(--border);
            display: flex; align-items: center;
            transition: opacity 0.15s;
        }
        .osb-cta-link:hover { opacity: 0.75; }
        /* Mobile version: shown after mobile header */
        .order-status-bar-mob { display: none; font-size: 0.78rem; }
        .order-status-bar-mob .osb-left-link { padding-left: 1rem; }
        .order-status-bar-mob .osb-cta-link  { padding-right: 1rem; }

        /* ─── Responsive ─────────────────────────────────────────── */
        @media (min-width: 900px) and (max-width: 1100px) {
            .footer-grid { grid-template-columns: 1.4fr 1fr 1fr 1fr; }
            .footer-col--hours { grid-column: 1 / -1; }
        }
        @media (max-width: 768px) {
            html { scroll-padding-top: 130px; }
            .site-header   { display: none; }
            .mobile-header { display: block; }
            .mobile-bottom-nav { display: block; }
            .order-status-bar-mob { display: flex; }
            .site-footer   { padding-bottom: calc(2.5rem + 80px + env(safe-area-inset-bottom)); margin-top: 3rem; }
            .footer-grid   { grid-template-columns: 1fr 1fr; gap: 2rem; }
            .footer-brand  { grid-column: 1 / -1; text-align: center; }
            .footer-brand p,
            .footer-thanks { max-width: 100%; margin-left: auto; margin-right: auto; }
            .footer-chat-btns,
            .footer-trust { justify-content: center; }
            .footer-order-cta { width: 100%; max-width: 280px; }
            .footer-col { text-align: center; }
            .footer-hours-row { justify-content: center; gap: 1rem; }
            .footer-bottom { flex-direction: column; text-align: center; }
        }
        @media (max-width: 480px) {
            .footer-grid { grid-template-columns: 1fr; }
            .footer-col { text-align: center; }
            .mob-logo span { max-width: 9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        }
        @media (max-width: 390px) {
            .mob-logo span { display: none; }
            .mob-order-btn { padding: 0.45rem 0.65rem; font-size: 0.75rem; }
            .mob-hdr-btns a[href="/customer/login"] { padding: 0.35rem 0.5rem; font-size: 0.75rem; }
        }

        /* ─── Shared Utility ─────────────────────────────────────── */
        .container { max-width: 1280px; margin: 0 auto; padding: 0 2rem; }
        @media (max-width: 768px) { .container { padding: 0 1rem; } }
    </style>
    @endverbatim

    @yield('styles')

    <script nonce="{{ csp_nonce() }}">
        document.addEventListener('DOMContentLoaded', () => {
            const hdr = document.querySelector('.site-header');
            const mobHdr = document.querySelector('.mobile-header');
            if (hdr || mobHdr) {
                window.addEventListener('scroll', () => {
                    const on = scrollY > 10;
                    if (hdr) hdr.classList.toggle('scrolled', on);
                    if (mobHdr) mobHdr.classList.toggle('scrolled', on);
                }, { passive: true });
            }
            const path = location.pathname;
            document.querySelectorAll('.header-nav a, .mob-nav-item[href]').forEach(a => {
                const h = a.getAttribute('href');
                if (!h) return;
                if (h === '/' && path === '/') { a.classList.add('active'); return; }
                if (h === '/#offers' && (path === '/' || location.hash === '#offers')) {
                    if (location.hash === '#offers') a.classList.add('active');
                    return;
                }
                if (h !== '/' && !h.startsWith('/#') && (h === path || path.startsWith(h))) {
                    a.classList.add('active');
                }
            });

            // ── Desktop "More" dropdown toggle ─────────────────────────
            const moreBtn   = document.getElementById('moreBtn');
            const morePanel = document.getElementById('morePanel');
            if (moreBtn && morePanel) {
                moreBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const open = morePanel.classList.toggle('open');
                    moreBtn.classList.toggle('open', open);
                    moreBtn.setAttribute('aria-expanded', open);
                });
                document.addEventListener('click', () => {
                    morePanel.classList.remove('open');
                    moreBtn.classList.remove('open');
                    moreBtn.setAttribute('aria-expanded', 'false');
                });
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        morePanel.classList.remove('open');
                        moreBtn.classList.remove('open');
                        moreBtn.setAttribute('aria-expanded', 'false');
                        moreBtn.focus();
                    }
                });
            }
        });
    </script>
</head>
<body>
@if($gtmId !== '')
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id={{ e($gtmId) }}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
@endif

{{-- ─── Desktop Header ─────────────────────────────────────────── --}}
<header class="site-header">
    <div class="header-inner">
        <a href="/" class="site-logo">
            <img src="{{ $logoUrl }}" alt="{{ $siteName }}">
            <span>{{ $siteName }}</span>
        </a>
        {{-- Desktop nav: discovery links. Prayer sits in-row like order-app TopNav. --}}
        <nav class="header-nav" aria-label="Main navigation">
            <a href="/order/menu">Menu</a>
            <a href="/#offers">Offers</a>
            <a href="/order/events">Pre-order</a>
        </nav>
        <div class="header-prayer">
            @include('partials.prayer-banner')
        </div>
        <div class="header-actions">
            @auth('customer')
                @php
                    $cust = Auth::guard('customer')->user();
                    $dispPhoneDesk = preg_replace('/^\+?960/', '', preg_replace('/\D/', '', $cust->phone ?? ''));
                    $greetDesk = !empty($cust->name) ? $cust->name : $dispPhoneDesk;
                @endphp
                <a href="/order/account" class="hdr-account" title="{{ $greetDesk }}">Account</a>
                <form method="POST" action="{{ route('customer.logout') }}" style="display:inline;">
                    @csrf
                    <button type="submit" class="hdr-logout-btn">Log out</button>
                </form>
            @else
                <a href="/customer/login" class="hdr-login">Login</a>
            @endauth
            <button id="darkToggleDesktop" class="dark-toggle" aria-label="Toggle dark mode" title="Toggle dark mode">🌙</button>
            <a href="/order/menu" class="hdr-order">{{ $navOrderCta }}</a>
        </div>
    </div>
    @if($orderBar)
    <div class="order-status-bar {{ !$orderBarMeta['active'] ? 'order-status-bar--neutral' : '' }}">
        <a href="/order/order-history" class="osb-left osb-left-link">
            <span class="osb-dot {{ $orderBarMeta['active'] ? 'osb-dot--pulse' : '' }}" style="background:{{ $orderBarMeta['dot'] }};"></span>
            <span class="osb-label">My orders</span>
            <span class="osb-sep">·</span>
            <span class="osb-num">#{{ $orderBar->order_number ?? $orderBar->id }}</span>
            <span class="osb-sep">·</span>
            <span class="osb-status" style="color:{{ $orderBarMeta['color'] }};">{{ $orderBarMeta['label'] }}</span>
        </a>
        <a href="{{ $orderBarLink }}" class="osb-cta osb-cta-link">{{ $orderBarMeta['active'] ? 'Track →' : 'View all →' }}</a>
    </div>
    @endif
</header>

{{-- ─── Announcement Banner ──────────────────────────────────────── --}}
@php
    $annEnabled = content('announcement_enabled', 'false') === 'true';
    $annText    = trim(content('announcement_text', ''));
    $annUrl     = trim(content('announcement_url',  ''));
    $annStyle   = content('announcement_style', 'info');
@endphp
@if($annEnabled && $annText)
<div class="site-announcement site-announcement--{{ e($annStyle) }}" role="banner" aria-label="Site announcement">
    @if($annUrl)
        <a href="{{ e($annUrl) }}" class="site-announcement__inner">
            <span class="site-announcement__text">{{ $annText }}</span>
            <span class="site-announcement__arrow">→</span>
        </a>
    @else
        <div class="site-announcement__inner">
            <span class="site-announcement__text">{{ $annText }}</span>
        </div>
    @endif
</div>
@endif

{{-- Service Availability & Maintenance banner (plan §7). $serviceBanner is
     shared by App\Providers\AppServiceProvider view composer. --}}
@include('partials.service-banner')

{{-- ─── Mobile Top Bar ──────────────────────────────────────────── --}}
<div class="mobile-header">
    <div class="mob-hdr-row">
        <a href="/" class="mob-logo">
            <img src="{{ $logoUrl }}" alt="{{ $siteName }}">
            <span>{{ $siteName }}</span>
        </a>
        <div class="mob-hdr-btns">
            @auth('customer')
                @php
                    $cust = Auth::guard('customer')->user();
                    $dispPhone = preg_replace('/^\+?960/', '', preg_replace('/\D/', '', $cust->phone ?? ''));
                    $greetMob = !empty($cust->name) ? $cust->name : $dispPhone;
                @endphp
                <a href="/order/account" style="display:inline-flex;align-items:center;gap:0.3rem;padding:0.3rem 0.65rem;background:var(--surface);border:1px solid var(--border);border-radius:999px;font-size:0.75rem;font-weight:600;color:var(--muted);text-decoration:none;white-space:nowrap;">
                    👤 {{ $greetMob }}
                </a>
            @else
                <a href="/customer/login" style="font-size:0.8rem;color:var(--muted);font-weight:500;padding:0.4rem 0.75rem;">Login</a>
            @endauth
            <button id="darkToggleMobile" class="dark-toggle" aria-label="Toggle dark mode" style="width:40px;height:40px;font-size:0.9rem;">🌙</button>
            <a href="/order/" class="mob-order-btn">{{ str_replace(' →', '', $navOrderCta) }}</a>
        </div>
    </div>
</div>

{{-- Order status bar (mobile only — below mobile header) --}}
@if($orderBar)
<div class="order-status-bar order-status-bar-mob {{ !$orderBarMeta['active'] ? 'order-status-bar--neutral' : '' }}">
    <a href="/order/order-history" class="osb-left osb-left-link">
        <span class="osb-dot {{ $orderBarMeta['active'] ? 'osb-dot--pulse' : '' }}" style="background:{{ $orderBarMeta['dot'] }};"></span>
        <span class="osb-label">My orders</span>
        <span class="osb-sep">·</span>
        <span class="osb-num">#{{ $orderBar->order_number ?? $orderBar->id }}</span>
        <span class="osb-sep">·</span>
        <span class="osb-status" style="color:{{ $orderBarMeta['color'] }};">{{ $orderBarMeta['label'] }}</span>
    </a>
    <a href="{{ $orderBarLink }}" class="osb-cta osb-cta-link">{{ $orderBarMeta['active'] ? 'Track →' : 'View all →' }}</a>
</div>
@endif

{{-- Prayer banner (mobile — desktop copy lives inline in .header-prayer) --}}
<div class="site-prayer-wrap site-prayer-wrap--mobile">
    @include('partials.prayer-banner')
</div>

@yield('content')

{{-- ─── Footer ──────────────────────────────────────────────────── --}}
<footer class="site-footer">
    <div class="footer-grid">
        <div class="footer-brand">
            <a href="/" class="footer-brand-logo">
                <img src="{{ $logoUrl }}" alt="{{ $siteName }}" loading="lazy" decoding="async">
                {{ $siteName }}
            </a>
            <p>{{ $footerBlurb }}</p>
            <p class="footer-thanks">{{ $footerThanks }}</p>
            <div class="footer-chat-btns">
                @if($socialInstagram !== '')
                    <a href="{{ $socialInstagram }}" target="_blank" rel="noopener" class="footer-social-icon" aria-label="Instagram" data-social="instagram">
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 01-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 017.8 2m-.2 2A3.6 3.6 0 004 7.6v8.8A3.6 3.6 0 007.6 20h8.8a3.6 3.6 0 003.6-3.6V7.6A3.6 3.6 0 0016.4 4H7.6m9.65 1.5a1.25 1.25 0 110 2.5 1.25 1.25 0 010-2.5M12 7a5 5 0 110 10 5 5 0 010-10m0 2a3 3 0 100 6 3 3 0 000-6z"/></svg>
                    </a>
                @endif
                @if($socialFacebook !== '')
                    <a href="{{ $socialFacebook }}" target="_blank" rel="noopener" class="footer-social-icon" aria-label="Facebook" data-social="facebook">
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 12a10 10 0 10-11.5 9.9v-7H8v-3h2.5V9.5c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.5V12H17l-.4 3h-2.7v7A10 10 0 0022 12z"/></svg>
                    </a>
                @endif
                @if($socialTiktok !== '')
                    <a href="{{ $socialTiktok }}" target="_blank" rel="noopener" class="footer-social-icon" aria-label="TikTok" data-social="tiktok">
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 8.5a7.4 7.4 0 01-4.3-1.4v7.1a5.9 5.9 0 11-5.9-5.9c.3 0 .6 0 .9.1v2.9a3 3 0 100 5.9 3 3 0 003-3.1V2h2.9a4.5 4.5 0 003.4 3.5V8.5z"/></svg>
                    </a>
                @endif
                <a href="{{ $waLink }}" target="_blank" rel="noopener" class="footer-wa">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    WhatsApp
                </a>
                <a href="{{ $viberLink }}" class="footer-viber">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.4 0C5.7.3 1.2 4.8.9 10.5c-.2 3.4.8 6.5 2.7 8.9L2.2 24l4.8-1.4c1.4.7 3 1.1 4.7 1.1 6.1 0 11.1-5 11.1-11.1S17.9 0 11.8 0h-.4zm.5 2c5.1 0 9.1 4 9.1 9.1s-4 9.1-9.1 9.1c-1.6 0-3.2-.4-4.5-1.2l-.3-.2-3 .9.9-2.9-.2-.3C3.7 15.2 3.1 13.1 3.1 11 3.1 5.9 7.2 2 12.1 2h-.2zm-.8 3.2c-.3 0-.8.1-1.2.5C9.5 6.3 8.8 7 8.8 8.5s1 3 1.2 3.2c.2.2 2 3 4.8 4.2.7.3 1.2.4 1.6.5.7.2 1.3.1 1.8-.1.5-.3 1.6-1.5 1.8-2.3.2-.7.1-1.3-.1-1.5-.1-.2-.4-.3-.8-.5s-2.3-1.1-2.6-1.2c-.3-.1-.6-.2-.8.2-.2.3-.9 1.1-1.1 1.3-.2.2-.4.2-.7.1-.3-.1-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.2-.2.4-.4.5-.6.2-.2.2-.4.3-.6.1-.2 0-.4-.1-.6-.1-.1-.8-1.9-1.1-2.7-.2-.5-.5-.5-.7-.5z"/></svg>
                    Viber
                </a>
            </div>
            <a href="/order/menu" class="footer-order-cta">{{ $navOrderCta }}</a>
        </div>
        <div class="footer-col">
            <h4>{{ $footerQuickLinksHeading }}</h4>
            <a href="/">Home</a>
            <a href="/order/menu">Order Online</a>
            <a href="/order/events">Catering &amp; Events</a>
            <a href="/hours">Opening Hours</a>
            <a href="/contact">Contact Us</a>
        </div>
        <div class="footer-col footer-col--hours" data-footer-hours>
            <h4>{{ $footerHoursHeading }}</h4>
            <div class="footer-hours-list">
                @foreach($footerDayNames as $index => $day)
                    @php $dayHours = $footerHours[$index] ?? null; @endphp
                    <div class="footer-hours-row {{ $index === $footerHoursToday ? 'is-today' : '' }}">
                        <span class="footer-hours-day">{{ \Illuminate\Support\Str::substr($day, 0, 3) }}</span>
                        <span>
                            @if($dayHours && !($dayHours['closed'] ?? false))
                                {{ $dayHours['open'] }} – {{ $dayHours['close'] }}
                            @else
                                Closed
                            @endif
                        </span>
                    </div>
                @endforeach
            </div>
            @if($footerRamadanActive && trim((string) $footerRamadanNote) !== '')
                <p class="footer-ramadan-note">{{ $footerRamadanNote }}</p>
            @endif
            <a href="/hours" style="margin-top:0.75rem">Full hours →</a>
        </div>
        <div class="footer-col">
            <h4>{{ $footerLocationHeading }}</h4>
            <p>{{ $address }}</p>
            <p>{{ $landmark }}</p>
            <a href="{{ $mapsUrl }}" target="_blank" rel="noopener">📍 Get directions</a>
        </div>
        <div class="footer-col">
            <h4>{{ $footerContactHeading }}</h4>
            <a href="{{ $phoneTel }}">📞 {{ $phone }}</a>
            <a href="mailto:{{ $email }}">✉ {{ $email }}</a>
            <div class="footer-legal">
                <a href="/order/privacy">Privacy Policy</a>
                <a href="/terms">Terms &amp; Conditions</a>
                <a href="/refund">Refund Policy</a>
            </div>
        </div>
    </div>
    <div class="footer-trust" data-footer-trust>
        <span>{{ $footerPaymentsText }}</span>
        <span>{{ $footerDeliveryText }}</span>
    </div>
    <div class="footer-bottom">
        <span>© {{ date('Y') }} {{ $siteName }}. {{ $footerRightsSuffix }}</span>
        <span>Malé, Maldives</span>
    </div>
</footer>

{{-- ─── Mobile Bottom Navigation: Home · Menu · Order · Offers · Account ─── --}}
<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">
    <symbol id="mob-nav-home" viewBox="0 0 24 24"><path d="M3 9.75L12 3l9 6.75V21a1 1 0 01-1 1H4a1 1 0 01-1-1V9.75z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 22V12h6v10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="mob-nav-menu" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="14" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="14" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/></symbol>
    <symbol id="mob-nav-cart" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 10a4 4 0 01-8 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="mob-nav-offers" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="7" y1="7" x2="7.01" y2="7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
    <symbol id="mob-nav-account" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="7" r="4" fill="none" stroke="currentColor" stroke-width="2"/></symbol>
</svg>
<nav class="mobile-bottom-nav" aria-label="Mobile navigation" data-mobile-bottom-nav>
    <div class="mob-nav-grid">
        <a href="/" class="mob-nav-item" data-nav="home">
            <svg class="mob-nav-icon-svg" aria-hidden="true"><use href="#mob-nav-home"/></svg>Home
        </a>
        <a href="/order/menu" class="mob-nav-item" data-nav="menu">
            <svg class="mob-nav-icon-svg" aria-hidden="true"><use href="#mob-nav-menu"/></svg>Menu
        </a>
        <a href="/order/menu" class="mob-nav-item mob-nav-order" data-nav="order" aria-label="Order now">
            <svg class="mob-nav-icon-svg" aria-hidden="true"><use href="#mob-nav-cart"/></svg>Order
        </a>
        <a href="/#offers" class="mob-nav-item" data-nav="offers">
            <svg class="mob-nav-icon-svg" aria-hidden="true"><use href="#mob-nav-offers"/></svg>Offers
        </a>
        <a href="/order/account" class="mob-nav-item" data-nav="account">
            <svg class="mob-nav-icon-svg" aria-hidden="true"><use href="#mob-nav-account"/></svg>Account
        </a>
    </div>
</nav>

{{-- Shared floating island dropdown (used by prayer banners) --}}
<div id="hptPanel" class="hpt-panel" role="listbox" aria-label="Select island">
    <div class="hpt-search-row">
        <input type="text" id="hptSearch" class="hpt-search-input" placeholder="Search island or atoll…" autocomplete="off" spellcheck="false">
    </div>
    <div class="hpt-list" id="hptList"></div>
</div>

<script nonce="{{ csp_nonce() }}">
(function () {
    'use strict';

    /* Matches order-app PrayerBar: expandable banner + island picker */
    var PRAYERS   = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
    var PRAYER_EN = { fajr: 'Fajr', sunrise: 'Sunrise', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
    var ATOLL_ABBR = {
        'Haa Alif':'HA','Haa Dhaalu':'HDh','Shaviyani':'Sh','Noonu':'N','Raa':'R',
        'Baa':'B','Lhaviyani':'Lh','Kaafu':'K','Alif Alif':'AA','Alif Dhaalu':'ADh',
        'Vaavu':'V','Meemu':'M','Faafu':'F','Dhaalu':'Dh','Thaa':'Th','Laamu':'L',
        'Gaafu Alif':'GA','Gaafu Dhaalu':'GDh','Gnaviyani':'Gn','Seenu':'S','Malé':'K',
    };

    var timeSkew = {{ now()->timestamp * 1000 }} - Date.now();
    function getMVT()    { return new Date(Date.now() + timeSkew + 5 * 3600 * 1000); }
    function parseHHMM(s){ var p=s.split(':'); return +p[0]*60 + +p[1]; }
    function applyServerDate(response) {
        try {
            var d = response.headers.get('Date');
            if (d) { var s = new Date(d).getTime(); if (!isNaN(s)) timeSkew = s - Date.now(); }
        } catch(e) {}
    }
    function mvtDateStr(offsetDays) {
        var d=getMVT();
        if (offsetDays) d.setUTCDate(d.getUTCDate()+offsetDays);
        return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
    }
    function fmtCountdown(ms) {
        var t=Math.max(0,Math.floor(ms/1000)), h=Math.floor(t/3600), m=Math.floor((t%3600)/60), s=t%60;
        if (h>0) return h+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
        return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
    }
    function makeLabel(atollLatin, nameLatin) {
        var abbr = ATOLL_ABBR[atollLatin] || (atollLatin ? atollLatin.split(' ')[0] : '');
        return (abbr ? abbr+'. ' : '') + (nameLatin || '');
    }

    var MALE_DV = 'މާލެ';
    var MALE_FALLBACK = { id: 102, atollLatin: 'Kaafu', nameLatin: 'Malé' };
    function isMaleLatinName(nameLatin) {
        if (!nameLatin) return false;
        return nameLatin.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z]/g,'').toLowerCase()==='male';
    }
    function findMaleIsland(islands) {
        var male = islands.find(function(i){ return i.name===MALE_DV || isMaleLatinName(i.name_latin); });
        return male
            ? { id: male.id, atollLatin: male.atoll_latin||'Kaafu', nameLatin: male.name_latin||'Malé' }
            : MALE_FALLBACK;
    }

    function $$(id) { return document.getElementById(id); }
    function banners() { return Array.prototype.slice.call(document.querySelectorAll('[data-pt-banner]')); }
    function eachBanner(fn) { banners().forEach(fn); }

    var prayers         = null;
    var tomorrowPrayers = null;
    var currentIsland   = null;
    var allIslands      = [];
    var tickTimer       = null;
    var dropOpen        = false;
    var activeTrigger   = null;
    var expanded        = false;
    try { expanded = sessionStorage.getItem('pt_banner_expanded') === '1'; } catch(e) {}

    function computeTick() {
        if (!prayers) return null;
        var mv=getMVT(), nowMin=mv.getUTCHours()*60+mv.getUTCMinutes();
        var pName='', pTime='', cdStr='';
        for (var i=0; i<PRAYERS.length; i++) {
            var key=PRAYERS[i];
            if (!prayers[key]) continue;
            var pMin=parseHHMM(prayers[key]);
            if (pMin>nowMin) {
                var ms=(pMin-nowMin)*60000-mv.getUTCSeconds()*1000;
                pName=PRAYER_EN[key]; pTime=prayers[key]; cdStr=fmtCountdown(ms);
                break;
            }
        }
        if (!pName) {
            var tFajr = (tomorrowPrayers && tomorrowPrayers.fajr) ? tomorrowPrayers.fajr : prayers.fajr;
            var fajrMin=parseHHMM(tFajr);
            var msToMidnight=(24*60-nowMin)*60000-mv.getUTCSeconds()*1000;
            pName='Fajr'; pTime=tFajr; cdStr=fmtCountdown(msToMidnight+fajrMin*60000);
        }
        return { pName: pName, pTime: pTime, cdStr: cdStr };
    }

    function paintGrid(root, nextName) {
        var grid = root.querySelector('[data-pt-grid]');
        if (!grid || !prayers) return;
        grid.innerHTML = '';
        PRAYERS.forEach(function(key) {
            var cell = document.createElement('div');
            cell.className = 'prayer-banner-cell' + (PRAYER_EN[key] === nextName ? ' is-next' : '');
            cell.setAttribute('role', 'listitem');
            cell.innerHTML =
                '<span class="prayer-banner-cell-name">'+PRAYER_EN[key]+'</span>' +
                '<span class="prayer-banner-cell-time">'+(prayers[key] || '—')+'</span>';
            grid.appendChild(cell);
        });
    }

    function setExpandedUI(root, isOpen) {
        root.classList.toggle('is-expanded', isOpen);
        var btn = root.querySelector('[data-pt-expand]');
        var panel = root.querySelector('[data-pt-panel]');
        var chev = root.querySelector('[data-pt-chevron]');
        if (btn) btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        setHidden(panel, !isOpen);
        if (chev) chev.textContent = isOpen ? '⌃' : '▾';
    }

    function tick() {
        var info = computeTick();
        if (!info) return;
        var label = currentIsland ? makeLabel(currentIsland.atollLatin, currentIsland.nameLatin) : 'K. Malé';
        eachBanner(function(root) {
            var nameEl = root.querySelector('[data-pt-name]');
            var timeEl = root.querySelector('[data-pt-time]');
            var cdEl = root.querySelector('[data-pt-cd]');
            var locEl = root.querySelector('[data-pt-loc]');
            if (nameEl) nameEl.textContent = info.pName;
            if (timeEl) timeEl.textContent = ' ' + info.pTime;
            if (cdEl) cdEl.textContent = ' · next in ' + info.cdStr;
            if (locEl) locEl.textContent = label;
            if (expanded) paintGrid(root, info.pName);
        });
    }

    function setHidden(el, hide) {
        if (!el) return;
        if (hide) el.setAttribute('hidden', '');
        else el.removeAttribute('hidden');
        el.hidden = hide;
    }

    function showBanner(isl) {
        eachBanner(function(root) {
            root.classList.remove('is-loading');
            var sk = root.querySelector('[data-pt-skeleton]');
            var un = root.querySelector('[data-pt-unavailable]');
            var body = root.querySelector('[data-pt-body]');
            setHidden(sk, true);
            if (!prayers) {
                setHidden(un, false);
                setHidden(body, true);
                return;
            }
            setHidden(un, true);
            setHidden(body, false);
            setExpandedUI(root, expanded);
        });
        tick();
        if (!tickTimer) tickTimer = setInterval(tick, 1000);
    }

    function prefetchTomorrow(islandId) {
        var tom=mvtDateStr(1), tKey='pt_day_'+tom+'_'+islandId;
        try { var c=localStorage.getItem(tKey); if(c){ var tp=JSON.parse(c); if(tp.sunrise){ tomorrowPrayers=tp; return; } else { localStorage.removeItem(tKey); } } } catch(e){}
        fetch('/api/prayer-times?island_id='+islandId+'&date='+tom)
            .then(function(r){ return r.json(); })
            .then(function(d){ if(d.prayers){ tomorrowPrayers=d.prayers; try{localStorage.setItem(tKey,JSON.stringify(d.prayers));}catch(e){} } })
            .catch(function(){});
    }

    function loadPrayers(islandId, cb) {
        var today=mvtDateStr(), cKey='pt_day_'+today+'_'+islandId;
        try { var ct=localStorage.getItem('pt_day_'+mvtDateStr(1)+'_'+islandId); if(ct){ var pt=JSON.parse(ct); if(pt.sunrise) tomorrowPrayers=pt; else localStorage.removeItem('pt_day_'+mvtDateStr(1)+'_'+islandId); } } catch(e){}
        try { var c=localStorage.getItem(cKey); if(c){ var p=JSON.parse(c); if(!p.sunrise){ localStorage.removeItem(cKey); } else { prayers=p; cb(); prefetchTomorrow(islandId); return; } } } catch(e){}
        fetch('/api/prayer-times?island_id='+islandId+'&date='+today)
            .then(function(r){ applyServerDate(r); return r.json(); })
            .then(function(d){ if(d.prayers){ prayers=d.prayers; try{localStorage.setItem(cKey,JSON.stringify(prayers));}catch(e){} } cb(); prefetchTomorrow(islandId); })
            .catch(function(){ cb(); });
    }

    function selectIsland(isl) {
        currentIsland = { id: isl.id, atollLatin: isl.atoll_latin||'', nameLatin: isl.name_latin||isl.name };
        try { localStorage.setItem('pt_island', JSON.stringify(currentIsland)); } catch(e){}
        prayers = null; tomorrowPrayers = null;
        loadPrayers(currentIsland.id, function(){ showBanner(currentIsland); });
    }

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

    function toggleExpanded() {
        expanded = !expanded;
        try { sessionStorage.setItem('pt_banner_expanded', expanded ? '1' : '0'); } catch(e) {}
        eachBanner(function(root) { setExpandedUI(root, expanded); });
        tick();
    }

    function wireEvents() {
        eachBanner(function(root) {
            var expand = root.querySelector('[data-pt-expand]');
            var island = root.querySelector('[data-pt-island]');
            var change = root.querySelector('[data-pt-change-island]');
            var geo = root.querySelector('[data-pt-geo]');
            if (expand) expand.addEventListener('click', function(e){ e.stopPropagation(); toggleExpanded(); });
            if (island) island.addEventListener('click', function(e){ e.stopPropagation(); openIslands(island); });
            if (change) change.addEventListener('click', function(e){ e.stopPropagation(); openIslands(change); });
            if (geo) geo.addEventListener('click', function(e){ e.stopPropagation(); handleGeo(geo); });
        });
        var s=$$('hptSearch');
        if(s){
            s.addEventListener('input',  function(){ buildList(s.value); });
            s.addEventListener('click',  function(e){ e.stopPropagation(); });
        }
        var panel=$$('hptPanel');
        if(panel) panel.addEventListener('click', function(e){ e.stopPropagation(); });
        document.addEventListener('click',   function(){ if(dropOpen) closeDropdown(); });
        document.addEventListener('keydown', function(e){
            if (e.key !== 'Escape') return;
            if (dropOpen) { closeDropdown(); return; }
            if (expanded) toggleExpanded();
        });
    }

    function init() {
        wireEvents();
        var isl=null;
        try{ var s=localStorage.getItem('pt_island'); if(s) isl=JSON.parse(s); }catch(e){}

        if (isl) {
            currentIsland=isl;
            loadPrayers(isl.id, function(){ showBanner(isl); });
            return;
        }

        var didLoad = false;
        function useIsland(found) {
            if (didLoad) return; didLoad = true;
            isl = found;
            currentIsland = isl;
            try { localStorage.setItem('pt_island', JSON.stringify(isl)); } catch(e) {}
            loadPrayers(isl.id, function() { showBanner(isl); });
        }
        var fallbackTimer = setTimeout(function() { useIsland(MALE_FALLBACK); }, 3000);
        fetch('/api/prayer-times/islands')
            .then(function(r){ applyServerDate(r); return r.json(); })
            .then(function(d){
                clearTimeout(fallbackTimer);
                allIslands=d.islands||[];
                try{ localStorage.setItem('pt_islands_list', JSON.stringify(allIslands)); }catch(e){}
                useIsland(findMaleIsland(allIslands));
            }).catch(function(){ clearTimeout(fallbackTimer); useIsland(MALE_FALLBACK); });
    }

    if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

/* ── Dark mode ───────────────────────────────────────────────────────── */
(function() {
    var saved = localStorage.getItem('theme');
    var dark = saved === 'dark';
    function applyTheme(d) {
        document.documentElement.dataset.theme = d ? 'dark' : '';
        var icon = d ? '☀️' : '🌙';
        var dt = document.getElementById('darkToggleDesktop');
        var dm = document.getElementById('darkToggleMobile');
        if (dt) { dt.textContent = icon; dt.setAttribute('aria-label', d ? 'Switch to light mode' : 'Switch to dark mode'); }
        if (dm) { dm.textContent = icon; dm.setAttribute('aria-label', d ? 'Switch to light mode' : 'Switch to dark mode'); }
    }
    applyTheme(dark);
    function toggleDark() {
        dark = !dark;
        localStorage.setItem('theme', dark ? 'dark' : 'light');
        applyTheme(dark);
    }
    function attachToggles() {
        var dt = document.getElementById('darkToggleDesktop');
        var dm = document.getElementById('darkToggleMobile');
        if (dt) dt.addEventListener('click', toggleDark);
        if (dm) dm.addEventListener('click', toggleDark);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attachToggles);
    else attachToggles();
})();
</script>
</body>
</html>
