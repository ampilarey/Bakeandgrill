<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>@yield('title', 'Bake & Grill - Dhivehi Cuisine & Artisan Baking')</title>
    <meta name="description" content="@yield('description', 'Fresh Dhivehi food, artisan baking, and premium grills in Malé.')">
    
    <link rel="icon" type="image/svg+xml" href="{{ asset('logo.svg') }}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        :root {
            --teal: #1ba3b9;
            --teal-hover: #148a9d;
            --dark: #1c1e21;
            --gray: #f8f9fa;
            --text: #2d3436;
            --border: #e9ecef;
        }

        body {
            font-family: 'Poppins', sans-serif;
            background: #ffffff;
            color: var(--text);
            line-height: 1.6;
        }

        a {
            text-decoration: none;
            color: inherit;
        }

        .header {
            position: sticky;
            top: 0;
            background: #ffffff;
            border-bottom: 1px solid var(--border);
            z-index: 100;
            box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        }

        .header-content {
            max-width: 1400px;
            margin: 0 auto;
            padding: 1rem 2rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .logo {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            font-size: 1.4rem;
            font-weight: 600;
            color: var(--dark);
        }

        .logo img {
            width: 48px;
            height: 48px;
            border-radius: 12px;
        }

        .nav {
            display: flex;
            gap: 2rem;
            align-items: center;
        }

        .nav a {
            font-weight: 500;
            transition: color 0.2s;
        }

        .nav a:hover {
            color: var(--teal);
        }

        .order-btn {
            background: var(--teal);
            color: white;
            padding: 0.75rem 2rem;
            border-radius: 999px;
            font-weight: 600;
            transition: all 0.2s;
            box-shadow: 0 4px 12px rgba(27, 163, 185, 0.25);
        }

        .order-btn:hover {
            background: var(--teal-hover);
            transform: translateY(-2px);
        }

        .order-btn.disabled {
            background: #ccc;
            cursor: not-allowed;
            box-shadow: none;
        }

        .order-btn.disabled:hover {
            transform: none;
        }

        .cart-indicator {
            position: relative;
            background: var(--teal);
            color: white;
            padding: 0.5rem 1.25rem;
            border-radius: 999px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }

        .cart-indicator:hover {
            background: var(--teal-hover);
        }

        .cart-count {
            position: absolute;
            top: -8px;
            right: -8px;
            background: #e74c3c;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.75rem;
            font-weight: 700;
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.4rem 1rem;
            border-radius: 999px;
            font-size: 0.85rem;
            font-weight: 600;
            text-transform: uppercase;
        }

        .status-badge.open {
            background: #d4edda;
            color: #155724;
        }

        .status-badge.closed {
            background: #f8d7da;
            color: #721c24;
        }

        .footer {
            background: var(--dark);
            color: white;
            padding: 3rem 2rem;
            margin-top: 4rem;
        }

        .footer-content {
            max-width: 1400px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 3rem;
        }

        .footer h3 {
            margin-bottom: 1rem;
            font-size: 1.2rem;
        }

        .footer p, .footer a {
            color: rgba(255,255,255,0.8);
            margin-bottom: 0.5rem;
            display: block;
        }

        .footer a:hover {
            color: white;
        }

        .mobile-header {
            display: none;
        }
        
        @media (max-width: 768px) {
            .header {
                display: none;
            }
            
            .mobile-header {
                display: block !important;
                position: sticky;
                top: 0;
                background: #ffffff;
                border-bottom: 1px solid var(--border);
                z-index: 100;
                box-shadow: 0 2px 8px rgba(0,0,0,0.04);
                padding: 1rem;
            }
            
            .mobile-header-top {
                display: grid;
                grid-template-columns: 1fr auto;
                align-items: center;
                margin-bottom: 0.75rem;
                gap: 0.5rem;
            }
            
            .mobile-header-actions {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 0.5rem;
            }
            
            .mobile-header-actions > * {
                text-align: center;
                display: flex;
                align-items: center;
                justify-content: center;
                padding-left: 0.5rem !important;
                padding-right: 0.5rem !important;
            }
            
            .footer-content {
                grid-template-columns: 1fr;
                gap: 2rem;
                text-align: center;
            }
        }
    </style>
    
    <!-- Cart functionality -->
    <script>
        let cart = JSON.parse(localStorage.getItem('bakegrill_cart') || '[]');

        function updateCartDisplay() {
            const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
            const indicator = document.getElementById('cart-indicator');
            const mobileIndicator = document.getElementById('mobile-cart-indicator');
            const text = cartCount > 0 ? `🛒 Cart (${cartCount})` : '🛒 Cart';
            
            if (indicator) {
                indicator.innerHTML = text;
            }
            if (mobileIndicator) {
                mobileIndicator.innerHTML = text;
            }
        }

        // Cart timer - 3 minutes to checkout
        let cartTimer = null;
        
        function startCartTimer() {
            const cartExpiry = localStorage.getItem('cart_expiry');
            const now = Date.now();
            
            if (cartExpiry && now < parseInt(cartExpiry)) {
                // Timer already running
                return;
            }
            
            // Set expiry to 3 minutes from now
            const expiryTime = now + (3 * 60 * 1000);
            localStorage.setItem('cart_expiry', expiryTime.toString());
            
            checkCartExpiry();
        }
        
        function checkCartExpiry() {
            const cartExpiry = localStorage.getItem('cart_expiry');
            if (!cartExpiry) return;
            
            const now = Date.now();
            const expiryTime = parseInt(cartExpiry);
            
            if (now >= expiryTime) {
                // Time's up! Clear cart
                localStorage.removeItem('bakegrill_cart');
                localStorage.removeItem('cart_expiry');
                cart = [];
                updateCartDisplay();
                alert('⏰ Your cart expired after 3 minutes. Please add items again.');
                window.location.href = '/menu';
            } else {
                // Check again in 10 seconds
                setTimeout(checkCartExpiry, 10000);
            }
        }
        
        function addToCart(itemId, itemName, price) {
            const existing = cart.find(item => item.id === itemId);
            
            if (existing) {
                existing.quantity += 1;
            } else {
                cart.push({ id: itemId, name: itemName, price: parseFloat(price), quantity: 1 });
            }
            
            localStorage.setItem('bakegrill_cart', JSON.stringify(cart));
            updateCartDisplay();
            
            // Start timer on first item
            if (cart.length === 1 || !localStorage.getItem('cart_expiry')) {
                startCartTimer();
            }
            
            // Get remaining time
            const cartExpiry = localStorage.getItem('cart_expiry');
            const remaining = cartExpiry ? Math.ceil((parseInt(cartExpiry) - Date.now()) / 1000) : (3 * 60);
            
            // Toast
            const toast = document.createElement('div');
            const mins = Math.floor(remaining / 60);
            const secs = remaining % 60;
            toast.innerHTML = `✓ Added ${itemName}<br><small style="opacity:0.9">Complete checkout within ${mins > 0 ? mins + ' min ' : ''}${secs} sec</small>`;
            toast.style.cssText = 'position:fixed;top:100px;right:20px;background:#1ba3b9;color:white;padding:1rem 1.5rem;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.2);z-index:9999;font-weight:600;text-align:center;';
            document.body.appendChild(toast);
            setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 2500);
        }
        
        // Check cart expiry on page load
        document.addEventListener('DOMContentLoaded', checkCartExpiry);

        function goToCheckout() {
            if (cart.length === 0) {
                alert('Your cart is empty!');
                return;
            }
            // Check if logged in
            @if(!session('customer_id'))
                if (confirm('Please login to checkout. Login now?')) {
                    sessionStorage.setItem('afterLogin', '/checkout');
                    window.location.href = '/customer/login';
                }
            @else
                window.location.href = '/checkout';
            @endif
        }

        document.addEventListener('DOMContentLoaded', updateCartDisplay);
    </script>
    
    @yield('styles')
</head>
<body>
    <!-- Desktop Header -->
    <header class="header">
        <div class="header-content">
            <a href="/" class="logo">
                <img src="{{ asset('logo.svg') }}" alt="Bake & Grill">
                <span>Bake & Grill</span>
            </a>
            <nav class="nav">
                <a href="/">Home</a>
                <a href="/menu">Menu</a>
                <a href="/pre-order" style="color: #f39c12; font-weight: 600;">Event Orders</a>
                <a href="/hours">Hours</a>
                <a href="/contact">Contact</a>
                
                @if(session('customer_id'))
                    <span style="color: #636e72; font-weight: 500; font-size: 0.9rem;">
                        Hi, {{ str_replace('+960', '', session('customer_name')) }}
                    </span>
                    <form method="POST" action="{{ route('customer.logout') }}" style="display: inline;">
                        @csrf
                        <button type="submit" style="background: white; border: 1px solid var(--border); color: var(--dark); padding: 0.5rem 1rem; border-radius: 999px; cursor: pointer; font-weight: 500; transition: all 0.2s;">
                            Logout
                        </button>
                    </form>
                @else
                    <a href="/customer/login" style="color: #636e72; font-weight: 500;">Login</a>
                @endif
                
                <div class="cart-indicator" id="cart-indicator" onclick="goToCheckout()">
                    🛒 Cart
                </div>
                
                @php
                    $isOpen = app(\App\Services\OpeningHoursService::class)->isOpenNow();
                @endphp
                <a href="/menu" class="order-btn">Order Online →</a>
            </nav>
        </div>
    </header>

    <!-- Mobile Header -->
    <div class="mobile-header">
        <div class="mobile-header-top">
            <a href="/" style="display: flex; align-items: center; gap: 0.5rem; font-size: 1.1rem; font-weight: 600; color: var(--dark);">
                <img src="{{ asset('logo.svg') }}" alt="Bake & Grill" style="width: 36px; height: 36px; border-radius: 8px;">
                <span>Bake & Grill</span>
            </a>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
                @if(!session('customer_id'))
                    <a href="/customer/login" style="padding: 0.5rem 1rem; background: var(--teal); color: white; border-radius: 8px; font-size: 0.85rem; font-weight: 600;">Login</a>
                @else
                    <span style="padding: 0.4rem 0.85rem; background: #e8f5f7; color: var(--teal); border-radius: 8px; font-size: 0.8rem; font-weight: 500;">👤 {{ str_replace('+960', '', session('customer_name')) }}</span>
                    <form method="POST" action="{{ route('customer.logout') }}" style="display: inline;">
                        @csrf
                        <button type="submit" style="background: white; border: 1px solid var(--border); color: var(--dark); padding: 0.4rem 0.85rem; border-radius: 999px; cursor: pointer; font-size: 0.8rem;">
                            Logout
                        </button>
                    </form>
                @endif
            </div>
        </div>
        <div class="mobile-header-actions">
            <a href="/menu" style="padding: 0.5rem 1rem; background: #f8f9fa; border-radius: 8px; font-size: 0.85rem; font-weight: 500; white-space: nowrap;">🍽️ Menu</a>
            <div onclick="goToCheckout()" style="padding: 0.5rem 1rem; background: #f8f9fa; border-radius: 8px; font-size: 0.85rem; font-weight: 500; cursor: pointer; white-space: nowrap;">
                <span id="mobile-cart-indicator">🛒 Cart</span>
            </div>
            <a href="/menu" style="padding: 0.5rem 1rem; background: var(--teal); color: white; border-radius: 8px; font-size: 0.85rem; font-weight: 600; white-space: nowrap; box-shadow: 0 2px 8px rgba(27, 163, 185, 0.25);">Order</a>
            <a href="/pre-order" style="padding: 0.5rem 1rem; background: #f39c12; color: white; border-radius: 8px; font-size: 0.85rem; font-weight: 600; white-space: nowrap;">📅 Event</a>
        </div>
    </div>

    @yield('content')

    <!-- Footer -->
    <footer class="footer">
        <div class="footer-content">
            <div>
                <h3>Bake & Grill Café</h3>
                <p>Authentic Dhivehi cuisine, fresh pastries, and premium grills in Malé.</p>
            </div>
            <div>
                <h3>Location</h3>
                <p>Kalaafaanu hingun, Male, Maldives</p>
                <p>Near H. Sahara</p>
            </div>
            <div>
                <h3>Quick Links</h3>
                <a href="/menu">Menu</a>
                <a href="/hours">Opening Hours</a>
                <a href="/contact">Contact Us</a>
                <a href="/privacy">Privacy Policy</a>
            </div>
            <div>
                <h3>Contact</h3>
                <p>+960 9120011</p>
                <p>hello@bakeandgrill.mv</p>
                <a href="https://wa.me/9609120011" target="_blank">WhatsApp</a>
                <p style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.2); font-size: 0.85rem;">
                    <a href="/pos" target="_blank" style="color: rgba(255,255,255,0.6);">Staff Login (POS)</a>
                </p>
            </div>
        </div>
        <div style="text-align: center; padding-top: 2rem; margin-top: 2rem; border-top: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); font-size: 0.9rem;">
            © {{ date('Y') }} Bake & Grill. All rights reserved.
        </div>
    </footer>

    <style>
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    </style>
</body>
</html>
