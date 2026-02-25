<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>@yield('title', 'Bake & Grill – Café & Online Orders')</title>
    <meta name="description" content="@yield('description', 'Fresh Dhivehi food, artisan baking, and premium grills in Malé.')">

    <link rel="icon" type="image/svg+xml" href="{{ asset('logo.svg') }}">
    <link rel="alternate icon" href="{{ asset('favicon.ico') }}">
    <link rel="apple-touch-icon" href="{{ asset('logo.svg') }}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">

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

        .hdr-cart {
            display: flex;
            align-items: center;
            gap: 0.35rem;
            padding: 0.5rem 1rem;
            background: var(--amber-light);
            color: var(--amber);
            border: 1.5px solid rgba(212,129,58,0.2);
            border-radius: 10px;
            font-weight: 600;
            font-size: 0.875rem;
            cursor: pointer;
            transition: all 0.15s;
        }
        .hdr-cart:hover { background: var(--amber); color: white; }

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
        .mob-cart-btn {
            display: flex;
            align-items: center;
            gap: 0.3rem;
            padding: 0.45rem 0.875rem;
            background: var(--amber-light);
            color: var(--amber);
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.8rem;
            cursor: pointer;
            border: 1px solid rgba(212,129,58,0.2);
        }
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
        .footer-wa {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0.6rem 1.25rem;
            background: #25D366;
            color: white;
            border-radius: 10px;
            font-weight: 700;
            font-size: 0.875rem;
            transition: all 0.15s;
        }
        .footer-wa:hover { background: #1bba58; transform: translateY(-1px); }
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

    @yield('styles')

    <script>
        let cart = [];
        try { cart = JSON.parse(localStorage.getItem('bakegrill_cart') || '[]'); } catch(e) {}

        function updateCartDisplay() {
            const count = cart.reduce((s, i) => s + (i.quantity || 0), 0);
            const label = count > 0 ? `🛒 Cart (${count})` : '🛒 Cart';
            document.querySelectorAll('.cart-display').forEach(el => el.textContent = label);
        }

        function addToCart(id, name, price) {
            const found = cart.find(i => i.id === id);
            if (found) found.quantity++;
            else cart.push({ id, name, price: parseFloat(price), quantity: 1 });
            try { localStorage.setItem('bakegrill_cart', JSON.stringify(cart)); } catch(e) {}
            updateCartDisplay();
            showToast('✓ ' + name + ' added to cart');
        }

        function goToCheckout() {
            if (!cart.length) { showToast('Your cart is empty! Add some items first.', true); return; }
            window.location.href = '/order/';
        }

        function showToast(msg, warn) {
            const el = document.createElement('div');
            el.textContent = msg;
            el.style.cssText = [
                'position:fixed',
                'bottom:calc(84px + env(safe-area-inset-bottom))',
                'right:16px',
                'padding:0.875rem 1.25rem',
                'border-radius:12px',
                'font-weight:600',
                'font-size:0.875rem',
                'z-index:9999',
                'box-shadow:0 8px 24px rgba(0,0,0,0.15)',
                'transition:opacity 0.3s,transform 0.3s',
                'max-width:280px',
                'background:' + (warn ? '#D4813A' : '#2D7A4F'),
                'color:white',
            ].join(';');
            document.body.appendChild(el);
            setTimeout(() => {
                el.style.opacity = '0';
                el.style.transform = 'translateY(8px)';
                setTimeout(() => el.remove(), 300);
            }, 2800);
        }

        document.addEventListener('DOMContentLoaded', () => {
            updateCartDisplay();
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
            <img src="{{ asset('logo.svg') }}" alt="Bake & Grill">
            <span>Bake & Grill</span>
        </a>
        <nav class="header-nav">
            <a href="/">Home</a>
            <a href="/menu">Menu</a>
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
            <button class="hdr-cart" onclick="goToCheckout()">
                <span class="cart-display">🛒 Cart</span>
            </button>
            <a href="/order/" class="hdr-order">Order Now →</a>
        </div>
    </div>
</header>

{{-- ─── Mobile Top Bar ──────────────────────────────────────────── --}}
<div class="mobile-header">
    <div class="mob-hdr-row">
        <a href="/" class="mob-logo">
            <img src="{{ asset('logo.svg') }}" alt="Bake & Grill">
            <span>Bake & Grill</span>
        </a>
        <div class="mob-hdr-btns">
            @if(session('customer_id'))
                <span style="font-size:0.75rem;color:var(--muted);font-weight:500;">Hi, {{ str_replace('+960', '', session('customer_name')) }}</span>
            @else
                <a href="/customer/login" style="font-size:0.8rem;color:var(--muted);font-weight:500;padding:0.4rem 0.75rem;">Login</a>
            @endif
            <button class="mob-cart-btn" onclick="goToCheckout()">
                <span class="cart-display">🛒 Cart</span>
            </button>
            <a href="/order/" class="mob-order-btn">Order</a>
        </div>
    </div>
</div>

@yield('content')

{{-- ─── Footer ──────────────────────────────────────────────────── --}}
<footer class="site-footer">
    <div class="footer-grid">
        <div class="footer-brand">
            <a href="/" class="footer-brand-logo">
                <img src="{{ asset('logo.svg') }}" alt="Bake & Grill">
                Bake & Grill
            </a>
            <p>Authentic Dhivehi cuisine, artisan pastries, and expertly grilled specialties — freshly made every day in the heart of Malé.</p>
            <a href="https://wa.me/9609120011" target="_blank" class="footer-wa">💬 WhatsApp Us</a>
        </div>
        <div class="footer-col">
            <h4>Quick Links</h4>
            <a href="/">Home</a>
            <a href="/menu">Menu</a>
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
            <a href="tel:+9609120011">+960 9120011</a>
            <a href="mailto:hello@bakeandgrill.mv">hello@bakeandgrill.mv</a>
            <a href="/privacy" style="margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.3);font-size:0.8rem;">Privacy Policy</a>
            <a href="/admin" style="color:rgba(255,255,255,0.3);font-size:0.8rem;">Staff Dashboard</a>
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
        <a href="/menu" class="mob-nav-item">
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
