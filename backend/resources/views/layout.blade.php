<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>@yield('title', 'Bake & Grill – Café & Online Orders')</title>
    <meta name="description" content="@yield('description', 'Fresh Dhivehi food, artisan baking, and premium grills in Malé.')">
    <meta name="keywords" content="Bake and Grill, food delivery Maldives, Male restaurant, cafe, grills, online order">
    <meta name="author" content="Bake &amp; Grill">

    <!-- Open Graph -->
    <meta property="og:type" content="restaurant">
    <meta property="og:site_name" content="Bake &amp; Grill">
    <meta property="og:title" content="@yield('title', 'Bake &amp; Grill – Café &amp; Online Orders')">
    <meta property="og:description" content="@yield('description', 'Fresh Dhivehi food, artisan baking, and premium grills in Malé.')">
    <meta property="og:image" content="{{ asset('logo.png') }}">
    <meta property="og:url" content="{{ url()->current() }}">
    <meta name="twitter:card" content="summary">

    <!-- Structured Data (JSON-LD) -->
    <script type="application/ld+json">
    {
      "@@context": "https://schema.org",
      "@@type": "Restaurant",
      "name": "Bake & Grill",
      "description": "Fresh Dhivehi food, artisan baking, and premium grills in Malé, Maldives.",
      "url": "{{ url('/') }}",
      "logo": "{{ asset('logo.png') }}",
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

    <link rel="icon" type="image/png" href="{{ asset('logo.png') }}">
    <link rel="alternate icon" href="{{ asset('favicon.ico') }}">
    <link rel="apple-touch-icon" href="{{ asset('logo.png') }}">
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
            transition: color 0.15s;
        }
        .footer-col a:hover { color: white; }
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
            <img src="{{ asset('logo.png') }}" alt="Bake & Grill">
            <span>Bake & Grill</span>
        </a>
        <nav class="header-nav">
            <a href="/">Home</a>
            <a href="/hours">Hours</a>
            <a href="/contact">Contact</a>
        </nav>
        <div class="header-actions">
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
            <img src="{{ asset('logo.png') }}" alt="Bake & Grill">
            <span>Bake & Grill</span>
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

@yield('content')

{{-- ─── Footer ──────────────────────────────────────────────────── --}}
<footer class="site-footer">
    <div class="footer-grid">
        <div class="footer-brand">
            <a href="/" class="footer-brand-logo">
                <img src="{{ asset('logo.png') }}" alt="Bake & Grill">
                Bake & Grill
            </a>
            <p>Authentic Dhivehi cuisine, artisan pastries, and expertly grilled specialties — freshly made every day in the heart of Malé.</p>
            <div class="footer-chat-btns">
                <a href="https://wa.me/9609120011" target="_blank" rel="noopener" class="footer-wa">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    WhatsApp
                </a>
                <a href="viber://chat?number=%2B9609120011" class="footer-viber">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.4 0C5.7.3 1.2 4.8.9 10.5c-.2 3.4.8 6.5 2.7 8.9L2.2 24l4.8-1.4c1.4.7 3 1.1 4.7 1.1 6.1 0 11.1-5 11.1-11.1S17.9 0 11.8 0h-.4zm.5 2c5.1 0 9.1 4 9.1 9.1s-4 9.1-9.1 9.1c-1.6 0-3.2-.4-4.5-1.2l-.3-.2-3 .9.9-2.9-.2-.3C3.7 15.2 3.1 13.1 3.1 11 3.1 5.9 7.2 2 12.1 2h-.2zm-.8 3.2c-.3 0-.8.1-1.2.5C9.5 6.3 8.8 7 8.8 8.5s1 3 1.2 3.2c.2.2 2 3 4.8 4.2.7.3 1.2.4 1.6.5.7.2 1.3.1 1.8-.1.5-.3 1.6-1.5 1.8-2.3.2-.7.1-1.3-.1-1.5-.1-.2-.4-.3-.8-.5s-2.3-1.1-2.6-1.2c-.3-.1-.6-.2-.8.2-.2.3-.9 1.1-1.1 1.3-.2.2-.4.2-.7.1-.3-.1-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.2-.2.4-.4.5-.6.2-.2.2-.4.3-.6.1-.2 0-.4-.1-.6-.1-.1-.8-1.9-1.1-2.7-.2-.5-.5-.5-.7-.5z"/></svg>
                    Viber
                </a>
            </div>
        </div>
        <div class="footer-col">
            <h4>Quick Links</h4>
            <a href="/">Home</a>
            <a href="/order/menu">Menu</a>
            <a href="/order/">Order Online</a>
            <a href="/hours">Opening Hours</a>
            <a href="/contact">Contact Us</a>
        </div>
        <div class="footer-col">
            <h4>Location</h4>
            <p>Kalaafaanu Hingun</p>
            <p>Malé, Maldives</p>
            <p>Near H. Sahara</p>
        </div>
        <div class="footer-col">
            <h4>Contact</h4>
            <a href="tel:+9609120011">📞 +960 9120011</a>
            <a href="https://wa.me/9609120011" target="_blank" rel="noopener">💬 WhatsApp</a>
            <a href="viber://chat?number=%2B9609120011">📱 Viber</a>
            <a href="mailto:hello@bakeandgrill.mv">✉ hello@bakeandgrill.mv</a>
            <div style="margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;gap:0.35rem;">
                <a href="/privacy" style="color:rgba(255,255,255,0.3);font-size:0.8rem;">Privacy Policy</a>
                <a href="/terms" style="color:rgba(255,255,255,0.3);font-size:0.8rem;">Terms &amp; Conditions</a>
                <a href="/refund" style="color:rgba(255,255,255,0.3);font-size:0.8rem;">Refund Policy</a>
                <a href="/admin" style="color:rgba(255,255,255,0.15);font-size:0.75rem;margin-top:0.25rem;">Staff Dashboard</a>
            </div>
        </div>
    </div>
    <div class="footer-bottom">
        <span>© {{ date('Y') }} Bake & Grill. All rights reserved.</span>
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
        <div class="mob-nav-item mob-nav-order" onclick="window.location.href='/order/'">
            <span class="mob-nav-icon">🛒</span>Order
        </div>
        <a href="/hours" class="mob-nav-item">
            <span class="mob-nav-icon">🕐</span>Hours
        </a>
        <a href="/contact" class="mob-nav-item">
            <span class="mob-nav-icon">📞</span>Contact
        </a>
    </div>
</nav>

</body>
</html>
