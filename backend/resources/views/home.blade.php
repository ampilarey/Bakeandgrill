@extends('layout')

@section('title', 'Bake & Grill – Fresh Dhivehi Food & Artisan Baking')
@section('description', 'Order fresh Dhivehi food, artisan pastries, and premium grills online. Fast delivery across Malé.')

@section('styles')
<style>
/* ─── Banner/Carousel ──────────────────────────────────────────── */
.hero-banner {
    position: relative;
    height: 500px;
    overflow: hidden;
    background: var(--dark);
}
@media (max-width: 768px) { .hero-banner { height: 300px; } }

.banner-track {
    display: flex;
    height: 100%;
    transition: transform 0.65s cubic-bezier(0.4, 0, 0.2, 1);
}
.banner-slide {
    min-width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
}
.banner-slide img {
    position: absolute;
    inset: 0;
    width: 100%; height: 100%;
    object-fit: cover;
    opacity: 0.4;
}
.banner-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    padding: 3rem 10%;
    z-index: 2;
    background: linear-gradient(90deg, rgba(28,20,8,0.85) 0%, rgba(28,20,8,0.2) 100%);
}
@media (max-width: 768px) {
    .banner-overlay { align-items: center; text-align: center; padding: 2rem 1.5rem; }
}
.banner-tag {
    display: inline-block;
    background: var(--amber);
    color: white;
    padding: 0.3rem 0.875rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 1rem;
}
.banner-title {
    font-size: 3.25rem;
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1.1;
    color: white;
    margin-bottom: 0.875rem;
    text-shadow: 0 2px 16px rgba(0,0,0,0.3);
}
.banner-sub {
    font-size: 1.1rem;
    color: rgba(255,255,255,0.8);
    margin-bottom: 1.75rem;
    font-weight: 400;
}
.banner-cta {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.75rem;
    background: var(--amber);
    color: white;
    border-radius: 10px;
    font-weight: 700;
    font-size: 0.975rem;
    transition: all 0.2s;
}
.banner-cta:hover { background: var(--amber-hover); transform: translateY(-2px); }

.banner-btn {
    position: absolute;
    top: 50%; transform: translateY(-50%);
    z-index: 10;
    background: rgba(255,255,255,0.12);
    backdrop-filter: blur(4px);
    border: 1.5px solid rgba(255,255,255,0.25);
    color: white;
    width: 46px; height: 46px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 1.3rem;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.2s;
    -webkit-tap-highlight-color: transparent;
}
.banner-btn:hover { background: rgba(255,255,255,0.28); }
.banner-btn.prev { left: 1.5rem; }
.banner-btn.next { right: 1.5rem; }
@media (max-width: 768px) { .banner-btn { display: none; } }

.banner-dots {
    position: absolute;
    bottom: 1.25rem;
    left: 50%; transform: translateX(-50%);
    display: flex; gap: 6px; z-index: 10;
}
.banner-dot {
    width: 6px; height: 6px; border-radius: 99px;
    background: rgba(255,255,255,0.35);
    transition: all 0.3s; cursor: pointer;
}
.banner-dot.active { width: 22px; background: var(--amber); }

@media (max-width: 768px) {
    .banner-title { font-size: 1.85rem; }
    .banner-sub   { font-size: 0.9rem; }
}

/* ─── Hero ──────────────────────────────────────────────────────── */
.hero {
    padding: 5rem 2rem;
    background: linear-gradient(160deg, var(--amber-light) 0%, var(--bg) 55%);
    text-align: center;
    border-bottom: 1px solid var(--border);
}
.hero-inner { max-width: 640px; margin: 0 auto; }
.hero h1 {
    font-size: 3.25rem;
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1.12;
    color: var(--dark);
    margin: 1rem 0 1.25rem;
}
.hero h1 em { font-style: normal; color: var(--amber); }
.hero p {
    font-size: 1.125rem;
    color: var(--muted);
    margin-bottom: 2.25rem;
    line-height: 1.75;
}
.hero-btns { display: flex; gap: 0.875rem; justify-content: center; flex-wrap: wrap; }
.hero-hours { margin-top: 2rem; font-size: 0.875rem; color: var(--muted); }

.btn-primary {
    display: inline-flex; align-items: center; gap: 0.5rem;
    padding: 0.9rem 2rem;
    background: var(--amber); color: white;
    border-radius: 12px; font-weight: 700; font-size: 1rem;
    transition: all 0.2s;
    box-shadow: 0 4px 16px var(--amber-glow);
}
.btn-primary:hover { background: var(--amber-hover); transform: translateY(-2px); box-shadow: 0 6px 22px var(--amber-glow); }

.btn-outline {
    display: inline-flex; align-items: center; gap: 0.5rem;
    padding: 0.9rem 2rem;
    border: 2px solid var(--border); color: var(--text);
    border-radius: 12px; font-weight: 600; font-size: 1rem;
    transition: all 0.2s; background: var(--surface);
}
.btn-outline:hover { border-color: var(--amber); color: var(--amber); background: var(--amber-light); }

@media (max-width: 600px) {
    .hero h1  { font-size: 2.1rem; }
    .hero p   { font-size: 1rem; }
    .btn-primary, .btn-outline { width: 100%; justify-content: center; }
}

/* ─── Section ───────────────────────────────────────────────────── */
.section { padding: 5rem 2rem; }
.section-inner { max-width: 1280px; margin: 0 auto; }
.section-eyebrow {
    display: inline-block;
    font-size: 0.72rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--amber); margin-bottom: 0.5rem;
}
.section-title {
    font-size: 2rem; font-weight: 800; letter-spacing: -0.03em;
    color: var(--dark); margin-bottom: 2.5rem;
}

/* ─── Product Cards ─────────────────────────────────────────────── */
.products-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.5rem;
}
.product-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    overflow: hidden;
    transition: all 0.25s;
}
.product-card:hover {
    border-color: rgba(212,129,58,0.4);
    box-shadow: 0 12px 36px rgba(28,20,8,0.1);
    transform: translateY(-4px);
}
.product-img {
    position: relative;
    height: 196px;
    background: var(--amber-light);
    overflow: hidden;
}
.product-img img {
    width: 100%; height: 100%; object-fit: cover;
    transition: transform 0.4s;
}
.product-card:hover .product-img img { transform: scale(1.06); }
.product-img-placeholder {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    font-size: 3.5rem;
    background: linear-gradient(145deg, var(--amber-light), #F7E4C8);
}
.product-badge {
    position: absolute; top: 0.75rem; left: 0.75rem;
    padding: 0.28rem 0.75rem;
    border-radius: 999px;
    font-size: 0.7rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.05em;
    backdrop-filter: blur(6px);
}
.badge-hot { background: rgba(212,129,58,0.92); color: white; }
.badge-mto { background: rgba(45,122,79,0.9); color: white; }

.product-body { padding: 1.125rem 1.25rem 1.375rem; }
.product-cat {
    font-size: 0.7rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--amber); margin-bottom: 0.375rem;
}
.product-name {
    font-size: 1.1rem; font-weight: 700;
    color: var(--dark); line-height: 1.3; margin-bottom: 0.875rem;
}
.product-price {
    font-size: 1.4rem; font-weight: 800; letter-spacing: -0.02em;
    color: var(--dark); margin-bottom: 0.875rem;
}
.product-price small { font-size: 0.8rem; font-weight: 600; color: var(--muted); }

.add-btn {
    width: 100%; padding: 0.7rem;
    background: var(--amber); color: white;
    border: none; border-radius: 10px;
    font-weight: 700; font-size: 0.9rem;
    cursor: pointer; transition: all 0.15s; font-family: inherit;
    letter-spacing: 0.01em;
}
.add-btn:hover { background: var(--amber-hover); }
.add-btn:disabled { background: var(--border); color: var(--muted); cursor: not-allowed; }
.add-btn.preorder { background: #A07030; }
.add-btn.preorder:hover { background: #875C22; }

.view-all { text-align: center; margin-top: 2.5rem; }

/* ─── Trust Badges ──────────────────────────────────────────────── */
.trust-strip {
    background: var(--surface);
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    padding: 2rem;
}
.trust-inner {
    max-width: 1280px; margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
}
.trust-item {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 1rem 1.25rem;
    border-radius: 12px;
    background: var(--bg);
    border: 1px solid var(--border);
}
.trust-icon { font-size: 1.75rem; flex-shrink: 0; }
.trust-text strong { display: block; font-size: 0.875rem; font-weight: 700; color: var(--dark); }
.trust-text span   { font-size: 0.775rem; color: var(--muted); }

@media (max-width: 900px)  { .trust-inner { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px)  { .trust-inner { grid-template-columns: 1fr; } }

/* ─── Features Dark Strip ───────────────────────────────────────── */
.features-strip {
    background: var(--dark);
    padding: 5rem 2rem;
}
.features-inner {
    max-width: 1280px; margin: 0 auto;
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem;
}
.feat-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 16px;
    padding: 2rem 1.5rem;
    text-align: center;
    transition: all 0.2s;
}
.feat-card:hover { background: rgba(212,129,58,0.12); border-color: rgba(212,129,58,0.4); }
.feat-icon { font-size: 2.25rem; margin-bottom: 1rem; }
.feat-card h3 { font-size: 1.05rem; font-weight: 700; color: white; margin-bottom: 0.5rem; }
.feat-card p  { font-size: 0.875rem; color: rgba(255,255,255,0.5); line-height: 1.65; }

@media (max-width: 900px) { .features-inner { grid-template-columns: 1fr 1fr; } }
@media (max-width: 560px) { .features-inner { grid-template-columns: 1fr; } }
</style>
@endsection

@section('content')

{{-- ─── Banner Carousel ─────────────────────────────────────────── --}}
<div class="hero-banner">
    <div class="banner-track" id="bannerTrack">

        <div class="banner-slide" style="background:#1C1408;">
            <img src="{{ thumb_url(asset('images/cafe/WhatsApp_Image_2026-01-30_at_19.34.49-ffb9abd7-f645-48ef-a78b-f1b36191f0b3.png')) }}" loading="eager" alt="Bake & Grill">
            <div class="banner-overlay">
                <span class="banner-tag">🎉 Grand Opening Special</span>
                <h2 class="banner-title">20% off<br>all items this week</h2>
                <p class="banner-sub">Limited time — order now before it ends</p>
                <a href="/order/" class="banner-cta">Order Now →</a>
            </div>
        </div>

        <div class="banner-slide" style="background:#160E06;">
            <img src="{{ thumb_url(asset('images/cafe/WhatsApp_Image_2026-01-30_at_19.34.57-1d4f7fc3-8bca-4e81-bdb4-12a8dceb7dc0.png')) }}" loading="lazy" alt="Best Sellers">
            <div class="banner-overlay">
                <span class="banner-tag">🔥 Best Sellers</span>
                <h2 class="banner-title">Signature<br>Hedhikaa Platter</h2>
                <p class="banner-sub">Our most loved dish — try it today</p>
                <a href="/menu" class="banner-cta">Browse Menu →</a>
            </div>
        </div>

        <div class="banner-slide" style="background:#0E1810;">
            <img src="{{ thumb_url(asset('images/cafe/WhatsApp_Image_2026-01-30_at_19.34.55__1_-a88c997c-ebaa-4efc-a50d-11b8b178fd36.png')) }}" loading="lazy" alt="Free Delivery">
            <div class="banner-overlay">
                <span class="banner-tag">📦 Free Delivery</span>
                <h2 class="banner-title">Free delivery on<br>orders over MVR 200</h2>
                <p class="banner-sub">Delivered hot across all of Malé</p>
                <a href="/order/" class="banner-cta">Start Ordering →</a>
            </div>
        </div>

    </div>
    <button class="banner-btn prev" onclick="moveBanner(-1)" aria-label="Previous">‹</button>
    <button class="banner-btn next" onclick="moveBanner(1)"  aria-label="Next">›</button>
    <div class="banner-dots" id="bannerDots">
        <div class="banner-dot active" onclick="goBanner(0)"></div>
        <div class="banner-dot"        onclick="goBanner(1)"></div>
        <div class="banner-dot"        onclick="goBanner(2)"></div>
    </div>
</div>

<script>
(function() {
    let idx = 0, total = 3;
    let timer = setInterval(() => move(1), 5500);
    function move(d) { idx = (idx + d + total) % total; apply(); }
    window.moveBanner = move;
    window.goBanner   = function(i) { idx = i; clearInterval(timer); timer = setInterval(() => move(1), 5500); apply(); };
    function apply() {
        document.getElementById('bannerTrack').style.transform = 'translateX(-' + (idx * 100) + '%)';
        document.querySelectorAll('.banner-dot').forEach(function(d, i) { d.classList.toggle('active', i === idx); });
    }
})();
</script>

{{-- ─── Hero ────────────────────────────────────────────────────── --}}
<section class="hero">
    <div class="hero-inner">
        @if($isOpen)
            <span class="status-badge open">● We're open now</span>
        @else
            <span class="status-badge closed">● Currently closed</span>
        @endif
        <h1>Fresh Food,<br><em>Delivered Fast</em></h1>
        <p>Authentic Dhivehi cuisine, fresh-baked pastries, and expertly grilled specialties — delivered hot to your door.</p>
        <div class="hero-btns">
            <a href="/order/" class="btn-primary">🛒 Order Online Now</a>
            <a href="/menu"   class="btn-outline">View Full Menu</a>
        </div>
        @if($todayHours)
            <p class="hero-hours">Today's hours: {{ $todayHours['open'] }} – {{ $todayHours['close'] }}</p>
        @endif
    </div>
</section>

{{-- ─── Trust Strip ─────────────────────────────────────────────── --}}
<div class="trust-strip">
    <div class="trust-inner">
        <div class="trust-item">
            <span class="trust-icon">⚡</span>
            <div class="trust-text">
                <strong>30-45 min delivery</strong>
                <span>Hot & fresh, every time</span>
            </div>
        </div>
        <div class="trust-item">
            <span class="trust-icon">🥐</span>
            <div class="trust-text">
                <strong>Baked fresh daily</strong>
                <span>Pastries made every morning</span>
            </div>
        </div>
        <div class="trust-item">
            <span class="trust-icon">💳</span>
            <div class="trust-text">
                <strong>Online payment</strong>
                <span>BML or cash on delivery</span>
            </div>
        </div>
        <div class="trust-item">
            <span class="trust-icon">📞</span>
            <div class="trust-text">
                <strong>Call us anytime</strong>
                <span>+960 9120011</span>
            </div>
        </div>
    </div>
</div>

{{-- ─── Featured Items ──────────────────────────────────────────── --}}
<section class="section">
    <div class="section-inner">
        <div>
            <span class="section-eyebrow">
                @if($bestSellers->count() > 0 && $bestSellers->max('order_items_count') > 0)
                    🔥 Most Ordered
                @else
                    ⭐ Handpicked
                @endif
            </span>
            <div class="section-title">
                @if($bestSellers->count() > 0 && $bestSellers->max('order_items_count') > 0)
                    Best Sellers
                @else
                    Featured Items
                @endif
            </div>
        </div>

        <div class="products-grid">
            @foreach($featuredItems as $item)
                @php
                    $stockService = app(\App\Services\StockManagementService::class);
                    $stockStatus  = $stockService->getAvailabilityStatus($item);
                    $isBestSeller = isset($item->order_items_count) && $item->order_items_count > 0;
                    $isMTO        = $item->availability_type === 'made_to_order';
                @endphp
                <div class="product-card">
                    <div class="product-img">
                        @if($item->image_url ?? null)
                            @php
                                $path   = trim(preg_replace('#^https?://[^/]+#', '', $item->image_url ?? ''), '/');
                                $imgUrl = (str_starts_with($path, 'images/cafe/') && is_file(public_path($path)))
                                    ? asset($path)
                                    : ($item->image_url ?? '');
                            @endphp
                            <img src="{{ $imgUrl }}" alt="{{ $item->name }}" loading="lazy"
                                 onerror="this.parentElement.innerHTML='<div class=\'product-img-placeholder\'>🍽️</div>'">
                        @else
                            <div class="product-img-placeholder">
                                {{ ['🍔','🍟','🥤','🍰','☕','🥗','🍕','🥙'][array_rand(['🍔','🍟','🥤','🍰','☕','🥗','🍕','🥙'])] }}
                            </div>
                        @endif

                        @if($isBestSeller)
                            <span class="product-badge badge-hot">🔥 Best Seller</span>
                        @elseif($isMTO)
                            <span class="product-badge badge-mto">Made to Order</span>
                        @endif
                    </div>

                    <div class="product-body">
                        <div class="product-cat">{{ $item->category?->name }}</div>
                        <div class="product-name">{{ $item->name }}</div>
                        <div class="product-price"><small>MVR</small> {{ number_format($item->base_price, 2) }}</div>

                        @if($stockStatus['available'])
                            <button class="add-btn"
                                    onclick="addToCart({{ $item->id }}, '{{ addslashes($item->name) }}', {{ $item->base_price }})">
                                Add to Cart
                            </button>
                        @elseif($stockStatus['can_pre_order'])
                            <button class="add-btn preorder"
                                    onclick="addToCart({{ $item->id }}, '{{ addslashes($item->name) }}', {{ $item->base_price }})">
                                Pre-Order
                            </button>
                        @else
                            <button class="add-btn" disabled>Out of Stock</button>
                        @endif
                    </div>
                </div>
            @endforeach
        </div>

        <div class="view-all">
            <a href="/menu" class="btn-primary">Browse Full Menu →</a>
        </div>
    </div>
</section>

{{-- ─── Features ────────────────────────────────────────────────── --}}
<section class="features-strip">
    <div class="features-inner">
        <div class="feat-card">
            <div class="feat-icon">⚡</div>
            <h3>Fast Delivery</h3>
            <p>Hot food at your door in 30–45 minutes, anywhere in Malé</p>
        </div>
        <div class="feat-card">
            <div class="feat-icon">🥐</div>
            <h3>Fresh Every Day</h3>
            <p>Pastries baked fresh every morning, grills made to order</p>
        </div>
        <div class="feat-card">
            <div class="feat-icon">💳</div>
            <h3>Easy Payment</h3>
            <p>Pay online via BML or choose cash on delivery</p>
        </div>
    </div>
</section>

@endsection
