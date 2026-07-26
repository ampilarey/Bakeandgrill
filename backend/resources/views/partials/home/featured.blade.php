@php
    $sectionClass = (($stripeIndex ?? 0) % 2 === 0) ? 'section' : 'section alt';
@endphp

<section class="{{ $sectionClass }}">
    <div class="section-inner">
        <div class="section-header">
            <span class="section-eyebrow">
                @if($bestSellers->count() > 0 && $bestSellers->max('order_items_count') > 0)
                    {{ $homeFeaturedEyebrowBs }}
                @else
                    {{ $homeFeaturedEyebrowHp }}
                @endif
            </span>
            <h2 class="section-title">
                @if($bestSellers->count() > 0 && $bestSellers->max('order_items_count') > 0)
                    {{ $homeFeaturedTitleBs }}
                @else
                    {{ $homeFeaturedTitleHp }}
                @endif
            </h2>
            <p class="section-sub">{{ $homeFeaturedSubtitle }}</p>
        </div>

        <div class="products-grid">
            @foreach($featuredItems as $item)
                @php
                    $isBestSeller = isset($item->order_items_count) && $item->order_items_count > 0;
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
                                 data-fallback-class="product-img-placeholder"
                                 data-fallback-icon="🍽️">
                        @else
                            <div class="product-img-placeholder">🍽️</div>
                        @endif

                        @if($isBestSeller)
                            <span class="product-badge badge-bestseller">🔥 Best Seller</span>
                        @else
                            <span class="product-badge badge-fresh">Fresh Daily</span>
                        @endif
                    </div>

                    <div class="product-body">
                        @if($item->category?->name)
                            <div class="product-cat">{{ $item->category->name }}</div>
                        @endif
                        <div class="product-name">{{ $item->name }}</div>
                        @if($item->description ?? null)
                            <div class="product-desc">{{ Str::limit($item->description, 60) }}</div>
                        @endif
                        <div class="product-price-row">
                            <span class="product-currency">MVR</span>
                            <span class="product-price">{{ number_format($item->base_price, 2) }}</span>
                        </div>

                        <a href="/order/menu" class="add-btn">Order Now →</a>
                    </div>
                </div>
            @endforeach
        </div>

        <div class="view-all">
            <a href="/order/menu" class="btn-primary">Browse Full Menu →</a>
        </div>
    </div>
</section>
