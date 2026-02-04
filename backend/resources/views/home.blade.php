@extends('layout')

@section('title', 'Bake & Grill - Order Fresh Dhivehi Food Online')

@section('styles')
<style>
    .hero {
        background: linear-gradient(135deg, rgba(27, 163, 185, 0.08), rgba(184, 168, 144, 0.08));
        padding: 4rem 2rem;
    }

    .hero-content {
        max-width: 1400px;
        margin: 0 auto;
        text-align: center;
    }

    .hero h1 {
        font-size: 3.5rem;
        font-weight: 700;
        line-height: 1.2;
        margin-bottom: 1.5rem;
        color: var(--dark);
    }

    .hero p {
        font-size: 1.25rem;
        margin-bottom: 2.5rem;
        color: #636e72;
        max-width: 700px;
        margin-left: auto;
        margin-right: auto;
    }

    .btn {
        padding: 1.25rem 3rem;
        border-radius: 999px;
        font-weight: 600;
        font-size: 1.1rem;
        transition: all 0.2s;
        display: inline-block;
        margin: 0 0.5rem 1rem;
    }

    .btn-primary {
        background: var(--teal);
        color: white;
        box-shadow: 0 6px 20px rgba(27, 163, 185, 0.3);
    }

    .btn-primary:hover {
        background: var(--teal-hover);
        transform: translateY(-3px);
        box-shadow: 0 8px 25px rgba(27, 163, 185, 0.4);
    }

    .btn-secondary {
        background: white;
        color: var(--teal);
        border: 2px solid var(--teal);
    }

    .btn-secondary:hover {
        background: var(--teal);
        color: white;
    }

    .section {
        max-width: 1400px;
        margin: 4rem auto;
        padding: 0 2rem;
    }

    .section-title {
        font-size: 2.5rem;
        font-weight: 700;
        text-align: center;
        margin-bottom: 3rem;
        color: var(--dark);
    }

    .featured-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 2rem;
    }

    .product-card {
        background: white;
        border: 1px solid var(--border);
        border-radius: 20px;
        overflow: hidden;
        transition: all 0.3s;
        box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }

    .product-card:hover {
        transform: translateY(-8px);
        box-shadow: 0 16px 32px rgba(0,0,0,0.12);
        border-color: var(--teal);
    }

    .product-image {
        width: 100%;
        height: 220px;
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 4rem;
        position: relative;
        overflow: hidden;
    }
    .product-image img {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }

    .product-body {
        padding: 1.5rem;
    }

    .product-title {
        font-size: 1.35rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
        color: var(--dark);
    }

    .product-category {
        font-size: 0.85rem;
        color: #95a5a6;
        margin-bottom: 1rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .product-price {
        font-size: 1.75rem;
        font-weight: 700;
        color: var(--teal);
        margin-bottom: 1.25rem;
    }

    .add-to-cart-btn {
        width: 100%;
        padding: 0.85rem;
        background: var(--teal);
        color: white;
        border: none;
        border-radius: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 1rem;
    }

    .add-to-cart-btn:hover {
        background: var(--teal-hover);
        transform: scale(1.02);
    }

    .features {
        background: var(--gray);
        padding: 4rem 2rem;
        margin-top: 4rem;
    }

    .features-grid {
        max-width: 1400px;
        margin: 0 auto;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 3rem;
    }

    .feature {
        text-align: center;
    }

    .feature-icon {
        font-size: 4rem;
        margin-bottom: 1rem;
    }

    .feature h3 {
        font-size: 1.4rem;
        margin-bottom: 0.75rem;
        color: var(--dark);
    }

    @media (max-width: 968px) {
        .hero h1 {
            font-size: 2.2rem;
        }
        
        .hero p {
            font-size: 1.05rem;
        }
        
        .btn {
            font-size: 1rem;
            padding: 1rem 2rem;
            display: block;
            width: 100%;
            text-align: center;
            margin: 0.5rem 0;
        }
        
        .featured-grid {
            grid-template-columns: 1fr;
        }
        
        .features-grid {
            grid-template-columns: 1fr;
        }
        
        .section-title {
            font-size: 2rem;
        }
    }
</style>
@endsection

@section('content')
<!-- Photo Banner Carousel -->
<div style="position: relative; height: 400px; overflow: hidden;">
    <div class="banner-slider" style="display: flex; height: 100%; animation: bannerSlide 15s infinite;">
        <!-- Banner 1 -->
        <div style="min-width: 100%; height: 100%; position: relative; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
            <img src="{{ thumb_url(asset('images/cafe/WhatsApp_Image_2026-01-30_at_19.34.49-ffb9abd7-f645-48ef-a78b-f1b36191f0b3.png')) }}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.3; position: absolute;" loading="lazy">
            <div style="position: relative; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; text-align: center; padding: 2rem; z-index: 10;">
                <h2 style="font-size: 3rem; font-weight: 700; margin-bottom: 1rem; text-shadow: 0 2px 8px rgba(0,0,0,0.3);">🎉 Grand Opening Special!</h2>
                <p style="font-size: 1.5rem; margin-bottom: 1.5rem; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">20% off on all items this week</p>
                <a href="/menu" style="padding: 1rem 2.5rem; background: white; color: #667eea; border-radius: 999px; font-weight: 700; font-size: 1.1rem; text-decoration: none; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">Order Now →</a>
            </div>
        </div>
        
        <!-- Banner 2 -->
        <div style="min-width: 100%; height: 100%; position: relative; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
            <img src="{{ thumb_url(asset('images/cafe/WhatsApp_Image_2026-01-30_at_19.34.57-1d4f7fc3-8bca-4e81-bdb4-12a8dceb7dc0.png')) }}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.25; position: absolute;" loading="lazy">
            <div style="position: relative; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; text-align: center; padding: 2rem; z-index: 10;">
                <h2 style="font-size: 3rem; font-weight: 700; margin-bottom: 1rem; text-shadow: 0 2px 8px rgba(0,0,0,0.3);">🔥 Best Sellers</h2>
                <p style="font-size: 1.5rem; margin-bottom: 1.5rem; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">Try our signature hedhikaa platter</p>
                <a href="/menu" style="padding: 1rem 2.5rem; background: white; color: #f5576c; border-radius: 999px; font-weight: 700; font-size: 1.1rem; text-decoration: none; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">Browse Menu →</a>
            </div>
        </div>
        
        <!-- Banner 3 -->
        <div style="min-width: 100%; height: 100%; position: relative; background: linear-gradient(135deg, #1ba3b9 0%, #0e7888 100%);">
            <img src="{{ thumb_url(asset('images/cafe/WhatsApp_Image_2026-01-30_at_19.34.55__1_-a88c997c-ebaa-4efc-a50d-11b8b178fd36.png')) }}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.3; position: absolute;" loading="lazy">
            <div style="position: relative; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; text-align: center; padding: 2rem; z-index: 10;">
                <h2 style="font-size: 3rem; font-weight: 700; margin-bottom: 1rem; text-shadow: 0 2px 8px rgba(0,0,0,0.3);">📦 Free Delivery</h2>
                <p style="font-size: 1.5rem; margin-bottom: 1.5rem; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">On orders above MVR 200 across Malé</p>
                <a href="/menu" style="padding: 1rem 2.5rem; background: white; color: #1ba3b9; border-radius: 999px; font-weight: 700; font-size: 1.1rem; text-decoration: none; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">Start Ordering →</a>
            </div>
        </div>
    </div>
    
    <!-- Navigation Dots -->
    <div style="position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 10px; z-index: 20;">
        <div style="width: 12px; height: 12px; border-radius: 50%; background: rgba(255,255,255,0.5);"></div>
        <div style="width: 12px; height: 12px; border-radius: 50%; background: rgba(255,255,255,0.5);"></div>
        <div style="width: 12px; height: 12px; border-radius: 50%; background: rgba(255,255,255,0.5);"></div>
    </div>
</div>

<style>
@keyframes bannerSlide {
    0%, 30% { transform: translateX(0); }
    33%, 63% { transform: translateX(-100%); }
    66%, 96% { transform: translateX(-200%); }
    100% { transform: translateX(0); }
}

.banner-slider:hover {
    animation-play-state: paused;
}

@media (max-width: 768px) {
    .banner-slider h2 {
        font-size: 2rem !important;
    }
    .banner-slider p {
        font-size: 1.1rem !important;
    }
}
</style>

<section class="hero">
    <div class="hero-content">
        @if($isOpen)
            <span class="status-badge open">● Open Now</span>
        @else
            <span class="status-badge closed">● Closed</span>
        @endif
        
        <h1>Order Fresh Food, Delivered Fast</h1>
        <p>Authentic Dhivehi cuisine, fresh pastries, and expertly grilled specialties. Browse our menu and order online for quick pickup or delivery.</p>
        
        <div>
            <a href="/menu" class="btn btn-primary">Order Online Now 🛒</a>
            <a href="/pre-order" class="btn" style="background: #f39c12; color: white; border: 2px solid #f39c12;">📅 Event Orders</a>
            <a href="/menu" class="btn btn-secondary">View Full Menu</a>
        </div>
        
        @if($todayHours)
            <p style="margin-top: 2rem; font-size: 0.95rem; color: #636e72;">
                Today: {{ $todayHours['open'] }} - {{ $todayHours['close'] }}
            </p>
        @endif
    </div>
</section>

<section class="section">
    <h2 class="section-title">
        @if($bestSellers->count() > 0 && $bestSellers->max('order_items_count') > 0)
            🔥 Best Sellers
        @else
            Featured Items
        @endif
    </h2>
    <div class="featured-grid">
        @foreach($featuredItems as $item)
            <div class="product-card">
                <div class="product-image" style="position: relative; background: linear-gradient({{ rand(0, 360) }}deg, rgba({{ rand(100, 255) }}, {{ rand(100, 200) }}, {{ rand(150, 255) }}, 0.3), rgba({{ rand(50, 150) }}, {{ rand(150, 255) }}, {{ rand(100, 200) }}, 0.3));">
                    @if($item->image_url ?? null)
                        @php
                            $path = trim(preg_replace('#^https?://[^/]+#', '', $item->image_url ?? ''), '/');
                            $imgUrl = (str_starts_with($path, 'images/cafe/') && is_file(public_path($path))) ? asset($path) : ($item->image_url ?? '');
                        @endphp
                        <img src="{{ $imgUrl }}" alt="{{ $item->name }}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; position: relative; z-index: 1;" onerror="this.style.display='none'; var s=this.nextElementSibling; if(s){ s.style.display='flex'; }">
                        <span style="display: none; position: absolute; inset: 0; align-items: center; justify-content: center; font-size: 3rem; z-index: 0;">🍽️</span>
                    @else
                        {{ ['🍔', '🍟', '🥤', '🍰', '☕', '🥗', '🍕', '🌮'][rand(0, 7)] }}
                    @endif
                </div>
                <div class="product-body">
                    @if(isset($item->order_items_count) && $item->order_items_count > 0)
                        <div style="margin-bottom: 0.75rem;">
                            <span style="background: linear-gradient(135deg, #f093fb, #f5576c); color: white; padding: 0.35rem 0.85rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600;">
                                🔥 Best Seller
                            </span>
                        </div>
                    @endif
                    <div class="product-category">{{ $item->category?->name }}</div>
                    <h3 class="product-title">{{ $item->name }}</h3>
                    
                    @if($item->track_stock && $item->availability_type === 'stock_based')
                        <div style="font-size: 0.95rem; color: {{ $item->stock_quantity <= $item->low_stock_threshold ? '#e67e22' : '#27ae60' }}; margin-bottom: 0.65rem; font-weight: 600;">
                            📦 In Stock: {{ $item->stock_quantity }}
                        </div>
                    @elseif($item->availability_type === 'made_to_order')
                        <div style="font-size: 0.95rem; color: #27ae60; margin-bottom: 0.65rem; font-weight: 600;">
                            ✓ Made to Order
                        </div>
                    @endif
                    
                    <div class="product-price">MVR {{ number_format($item->base_price, 2) }}</div>
                    
                    @php
                        $stockService = app(\App\Services\StockManagementService::class);
                        $stockStatus = $stockService->getAvailabilityStatus($item);
                    @endphp
                    
                    @if($stockStatus['badge'])
                        <div style="margin-bottom: 0.75rem; padding: 0.4rem 0.85rem; background: {{ $stockStatus['badge_color'] }}; color: white; border-radius: 999px; font-size: 0.75rem; font-weight: 600; text-align: center;">
                            {{ $stockStatus['badge'] }}
                        </div>
                    @endif
                    
                    @if($stockStatus['available'])
                        <button 
                            class="add-to-cart-btn" 
                            onclick="addToCart({{ $item->id }}, '{{ addslashes($item->name) }}', {{ $item->base_price }})"
                        >
                            Add to Cart +
                        </button>
                    @elseif($stockStatus['can_pre_order'])
                        <button 
                            class="add-to-cart-btn" 
                            style="background: #f39c12;"
                            onclick="addToCart({{ $item->id }}, '{{ addslashes($item->name) }}', {{ $item->base_price }})"
                        >
                            Pre-Order
                        </button>
                    @else
                        <button class="add-to-cart-btn" style="background: #ccc; cursor: not-allowed;" disabled>
                            Out of Stock
                        </button>
                    @endif
                </div>
            </div>
        @endforeach
    </div>
    
    <div style="text-align: center; margin-top: 3rem;">
        <a href="/menu" class="btn btn-primary">View All Menu Items →</a>
    </div>
</section>

<section class="features">
    <div class="features-grid">
        <div class="feature">
            <div class="feature-icon">⚡</div>
            <h3>Fast Delivery</h3>
            <p>Fresh food delivered in 30-45 minutes across Malé</p>
        </div>
        <div class="feature">
            <div class="feature-icon">🌟</div>
            <h3>Fresh Daily</h3>
            <p>Pastries baked every morning, grilled items to order</p>
        </div>
        <div class="feature">
            <div class="feature-icon">💳</div>
            <h3>Easy Payment</h3>
            <p>Pay online or cash on delivery</p>
        </div>
    </div>
</section>
@endsection
