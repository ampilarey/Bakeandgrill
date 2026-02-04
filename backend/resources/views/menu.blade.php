@extends('layout')

@section('title', 'Menu - Bake & Grill')

@section('styles')
<style>
    .menu-hero {
        background: linear-gradient(135deg, rgba(27, 163, 185, 0.08), rgba(184, 168, 144, 0.08));
        padding: 3rem 2rem;
        text-align: center;
    }

    .menu-hero h1 {
        font-size: 3rem;
        font-weight: 700;
        margin-bottom: 0.5rem;
        color: var(--dark);
    }

    .items-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 2rem;
    }

    .menu-card {
        background: white;
        border: 1px solid #e9ecef;
        border-radius: 16px;
        overflow: hidden;
        transition: all 0.3s;
        box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }

    .menu-card:hover {
        transform: translateY(-6px);
        box-shadow: 0 12px 28px rgba(0,0,0,0.12);
        border-color: var(--teal);
    }

    .menu-card-image {
        width: 100%;
        height: 200px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 4rem;
        position: relative;
        overflow: hidden;
    }
    .menu-card-image img {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }

    .menu-card-body {
        padding: 1.5rem;
    }

    .menu-card h3 {
        font-size: 1.3rem;
        font-weight: 600;
        margin-bottom: 0.75rem;
        color: var(--dark);
    }

    .price {
        font-size: 1.6rem;
        font-weight: 700;
        color: var(--teal);
        margin-bottom: 1rem;
    }

    .add-btn {
        width: 100%;
        padding: 0.85rem;
        background: var(--teal);
        color: white;
        border: none;
        border-radius: 10px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }

    .add-btn:hover {
        background: var(--teal-hover);
    }

    .best-seller-badge {
        display: inline-block;
        background: linear-gradient(135deg, #f093fb, #f5576c);
        color: white;
        padding: 0.3rem 0.75rem;
        border-radius: 999px;
        font-size: 0.7rem;
        font-weight: 600;
        margin-right: 0.5rem;
        margin-bottom: 0.5rem;
    }

    @media (max-width: 768px) {
        .menu-hero h1 {
            font-size: 2.2rem;
        }
        
        .items-grid {
            grid-template-columns: 1fr;
        }
        
        #desktopFilters {
            display: none !important;
        }
        
        #mobileFilters {
            display: block !important;
        }
    }
</style>
@endsection

@section('content')
<div class="menu-hero">
    <h1>Our Complete Menu</h1>
    <p style="font-size: 1.1rem; color: #636e72; margin-top: 0.5rem;">Browse and add items to your cart</p>
</div>

<!-- Desktop: One Row -->
<div id="desktopFilters" style="background: white; padding: 1.25rem 2rem; border-bottom: 1px solid #e9ecef;">
    <div style="max-width: 1400px; margin: 0 auto; display: flex; gap: 1.25rem; align-items: center;">
        <div style="flex: 1; position: relative;">
            <input type="text" id="searchInput" placeholder="🔍 Search..." onkeyup="showSearchSuggestions(this.value)" onfocus="showSearchSuggestions(this.value)" onblur="setTimeout(() => hideSuggestions(), 200)" style="width: 100%; padding: 0.7rem 1rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box;">
            <div id="searchSuggestions" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: white; border: 2px solid #e9ecef; border-top: none; border-radius: 0 0 8px 8px; max-height: 300px; overflow-y: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 100; margin-top: -8px;"></div>
        </div>
            <select id="categoryFilter" onchange="applyFilters()" style="padding: 0.7rem 1rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 0.95rem; cursor: pointer;">
                <option value="all">All Items</option>
                @php
                    $mainCategories = \App\Models\Category::with('children')->whereNull('parent_id')->orderBy('sort_order')->get();
                @endphp
                @foreach($mainCategories as $mainCat)
                    <option value="cat-{{ $mainCat->id }}" style="font-weight: 600;">{{ $mainCat->name }}</option>
                    @foreach($mainCat->children as $subCat)
                        <option value="cat-{{ $subCat->id }}">&nbsp;&nbsp;└─ {{ $subCat->name }}</option>
                    @endforeach
                @endforeach
            </select>
            <select id="sortFilter" onchange="applyFilters()" style="padding: 0.7rem 1rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 0.95rem; cursor: pointer;">
                <option value="popular">Popular</option>
                <option value="name">A-Z</option>
                <option value="price-low">Low Price</option>
                <option value="price-high">High Price</option>
            </select>
        <input type="number" id="minPrice" placeholder="Min" onchange="applyFilters()" style="width: 75px; padding: 0.7rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 0.9rem;">
        <span style="color: #95a5a6;">–</span>
        <input type="number" id="maxPrice" placeholder="Max" onchange="applyFilters()" style="width: 75px; padding: 0.7rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 0.9rem;">
        <button onclick="clearAllFilters()" style="padding: 0.7rem 1.25rem; background: #f8f9fa; border: 2px solid #e9ecef; border-radius: 8px; font-weight: 600; cursor: pointer;">✕</button>
    </div>
</div>

<!-- Mobile: EXACTLY 2 Rows - Properly Aligned -->
<div id="mobileFilters" style="display: none; background: white; padding: 1rem; border-bottom: 1px solid #e9ecef;">
    <div>
        <!-- Row 1: Search with autocomplete -->
        <div style="margin-bottom: 0.75rem; position: relative;">
            <input type="text" id="mobileSearch" placeholder="🔍 Search..." onkeyup="document.getElementById('searchInput').value = this.value; showSearchSuggestions(this.value)" onfocus="showSearchSuggestions(this.value)" onblur="setTimeout(() => hideSuggestions(), 200)" style="width: 100%; padding: 0.85rem 1rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 1rem; box-sizing: border-box;">
            <div id="mobileSuggestions" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: white; border: 2px solid #e9ecef; border-top: none; border-radius: 0 0 8px 8px; max-height: 250px; overflow-y: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 100; margin-top: -8px;"></div>
        </div>
        <!-- Row 2: All filters - same total width as search -->
        <div style="display: grid; grid-template-columns: 1fr 1fr 0.8fr 0.8fr 0.6fr; gap: 0.5rem;">
            <select id="mobileCat" onchange="document.getElementById('categoryFilter').value = this.value; applyFilters()" style="width: 100%; padding: 0.75rem 0.25rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 0.8rem; box-sizing: border-box;">
                <option value="all">All</option>
                @php
                    $allCats = \App\Models\Category::with('children')->whereNull('parent_id')->orderBy('sort_order')->get();
                @endphp
                @foreach($allCats as $main)
                    <option value="cat-{{ $main->id }}">{{ $main->name }}</option>
                    @foreach($main->children as $sub)
                        <option value="cat-{{ $sub->id }}">&nbsp;&nbsp;{{ $sub->name }}</option>
                    @endforeach
                @endforeach
            </select>
            <select id="mobileSort" onchange="document.getElementById('sortFilter').value = this.value; applyFilters()" style="width: 100%; padding: 0.75rem 0.25rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 0.8rem; box-sizing: border-box;">
                <option value="popular">★ Top</option>
                <option value="name">A-Z</option>
                <option value="price-low">Low ރ</option>
                <option value="price-high">High ރ</option>
            </select>
            <input type="number" id="mobileMin" placeholder="Min" onchange="document.getElementById('minPrice').value = this.value; applyFilters()" style="width: 100%; padding: 0.75rem 0.25rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 0.75rem; text-align: center; box-sizing: border-box;">
            <input type="number" id="mobileMax" placeholder="Max" onchange="document.getElementById('maxPrice').value = this.value; applyFilters()" style="width: 100%; padding: 0.75rem 0.25rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 0.75rem; text-align: center; box-sizing: border-box;">
            <button onclick="clearAllFilters()" style="width: 100%; padding: 0.75rem 0.25rem; background: #f8f9fa; border: 2px solid #e9ecef; border-radius: 8px; font-weight: 600; font-size: 1.1rem; box-sizing: border-box;">✕</button>
        </div>
    </div>
</div>

<div style="max-width: 1400px; margin: 2rem auto 4rem; padding: 0 2rem;">
    <div class="items-grid" id="allItemsGrid">
        @foreach($allItems as $item)
            <div class="menu-card item-card" data-category="cat-{{ $item->category_id }}" data-name="{{ strtolower($item->name) }}" data-price="{{ $item->base_price }}" data-orders="{{ $item->order_items_count }}">
                <div class="menu-card-image" style="position: relative; background: linear-gradient({{ 45 + ($loop->index * 30) }}deg, rgba({{ 100 + rand(0, 155) }}, {{ 150 + rand(0, 105) }}, {{ 200 + rand(0, 55) }}, 0.4), rgba({{ 150 + rand(0, 105) }}, {{ 100 + rand(0, 155) }}, {{ 200 + rand(0, 55) }}, 0.4));">
                    @if($item->image_url)
                        @php
                            $path = trim(preg_replace('#^https?://[^/]+#', '', $item->image_url), '/');
                            $imgUrl = (str_starts_with($path, 'images/cafe/') && is_file(public_path($path))) ? asset($path) : $item->image_url;
                        @endphp
                        <img src="{{ $imgUrl }}" alt="{{ $item->name }}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; position: relative; z-index: 1;" onerror="this.style.display='none'; var s=this.nextElementSibling; if(s){ s.style.display='flex'; }">
                        <span style="display: none; position: absolute; inset: 0; align-items: center; justify-content: center; font-size: 3rem; z-index: 0;">🍽️</span>
                    @else
                        {{ ['🍔', '🍟', '🥤', '🍰', '☕', '🥗', '🍕', '🌮'][rand(0, 7)] }}
                    @endif
                </div>
                <div class="menu-card-body">
                    <div style="margin-bottom: 0.75rem;">
                        @if($item->order_items_count > $threshold)
                            <span class="best-seller-badge">🔥 Best Seller</span>
                        @endif
                        
                        @php
                            $stockService = app(\App\Services\StockManagementService::class);
                            $stockStatus = $stockService->getAvailabilityStatus($item);
                        @endphp
                        
                        @if($stockStatus['badge'])
                            <span style="display: inline-block; background: {{ $stockStatus['badge_color'] }}; color: white; padding: 0.35rem 0.85rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; margin-left: 0.5rem;">
                                {{ $stockStatus['badge'] }}
                            </span>
                        @endif
                    </div>
                    
                    <h3>{{ $item->name }}</h3>
                    
                    @if($item->track_stock && $item->availability_type === 'stock_based')
                        <div style="font-size: 0.9rem; color: {{ $item->stock_quantity <= $item->low_stock_threshold ? '#e67e22' : '#27ae60' }}; margin-bottom: 0.5rem; font-weight: 600;">
                            📦 Stock: {{ $item->stock_quantity }} units
                        </div>
                    @elseif($item->availability_type === 'made_to_order')
                        <div style="font-size: 0.9rem; color: #27ae60; margin-bottom: 0.5rem; font-weight: 600;">
                            ✓ Made Fresh to Order
                        </div>
                    @endif
                    
                    <div class="price">MVR {{ number_format($item->base_price, 2) }}</div>
                    
                    @if($stockStatus['available'])
                        <button class="add-btn" onclick="addToCart({{ $item->id }}, '{{ addslashes($item->name) }}', {{ $item->base_price }})">
                            Add to Cart +
                        </button>
                    @elseif($stockStatus['can_pre_order'])
                        <button class="add-btn" style="background: #f39c12;" onclick="addToCart({{ $item->id }}, '{{ addslashes($item->name) }}', {{ $item->base_price }})">
                            📅 Pre-Order
                        </button>
                    @else
                        <button class="add-btn" style="background: #ccc; cursor: not-allowed;" disabled>
                            Out of Stock
                        </button>
                    @endif
                </div>
            </div>
        @endforeach
    </div>
</div>

<script>
function applyFilters() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const category = document.getElementById('categoryFilter').value;
    const sort = document.getElementById('sortFilter').value;
    const min = parseFloat(document.getElementById('minPrice').value) || 0;
    const max = parseFloat(document.getElementById('maxPrice').value) || Infinity;
    
    const cards = Array.from(document.querySelectorAll('.item-card'));
    let visible = [];
    
    cards.forEach(card => {
        const name = card.getAttribute('data-name');
        const cat = card.getAttribute('data-category');
        const price = parseFloat(card.getAttribute('data-price'));
        
        if ((!search || name.includes(search)) && 
            (category === 'all' || cat === category) && 
            price >= min && price <= max) {
            card.style.display = 'block';
            visible.push({ card, name, price, orders: parseInt(card.getAttribute('data-orders') || 0) });
        } else {
            card.style.display = 'none';
        }
    });
    
    if (sort === 'price-low') visible.sort((a, b) => a.price - b.price);
    else if (sort === 'price-high') visible.sort((a, b) => b.price - a.price);
    else if (sort === 'popular') visible.sort((a, b) => b.orders - a.orders);
    else visible.sort((a, b) => a.name.localeCompare(b.name));
    
    const grid = document.getElementById('allItemsGrid');
    visible.forEach(({ card }) => grid.appendChild(card));
}

function clearAllFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('categoryFilter').value = 'all';
    document.getElementById('sortFilter').value = 'popular';
    document.getElementById('minPrice').value = '';
    document.getElementById('maxPrice').value = '';
    if (document.getElementById('mobileSearch')) {
        document.getElementById('mobileSearch').value = '';
        document.getElementById('mobileCat').value = 'all';
        document.getElementById('mobileSort').value = 'popular';
        document.getElementById('mobileMin').value = '';
        document.getElementById('mobileMax').value = '';
    }
    hideSuggestions();
    applyFilters();
}

// Autocomplete
const allMenuItems = {!! json_encode($allItems->map(function($item) {
    return [
        'id' => $item->id,
        'name' => $item->name,
        'price' => $item->base_price,
        'category' => $item->category ? $item->category->name : null
    ];
})->values()) !!};

function showSearchSuggestions(query) {
    const desktop = document.getElementById('searchSuggestions');
    const mobile = document.getElementById('mobileSuggestions');
    
    if (!query || query.length < 1) {
        hideSuggestions();
        applyFilters();
        return;
    }
    
    const matches = allMenuItems.filter(item => 
        item.name.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 8);
    
    if (matches.length === 0) {
        hideSuggestions();
        applyFilters();
        return;
    }
    
    const html = matches.map(item => `
        <div onmousedown="selectItem('${item.name.replace(/'/g, "\\'")}'); event.preventDefault();" style="padding: 0.85rem 1.25rem; cursor: pointer; border-bottom: 1px solid #f5f5f5; transition: background 0.2s;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">
            <div style="font-weight: 600; color: #2d3436;">${item.name}</div>
            <div style="font-size: 0.85rem; color: #95a5a6; margin-top: 0.25rem;">
                ${item.category || ''} • MVR ${parseFloat(item.price).toFixed(2)}
            </div>
        </div>
    `).join('');
    
    if (desktop) {
        desktop.innerHTML = html;
        desktop.style.display = 'block';
    }
    if (mobile) {
        mobile.innerHTML = html;
        mobile.style.display = 'block';
    }
    
    applyFilters();
}

function selectItem(name) {
    document.getElementById('searchInput').value = name;
    if (document.getElementById('mobileSearch')) {
        document.getElementById('mobileSearch').value = name;
    }
    hideSuggestions();
    applyFilters();
}

function hideSuggestions() {
    const desktop = document.getElementById('searchSuggestions');
    const mobile = document.getElementById('mobileSuggestions');
    if (desktop) desktop.style.display = 'none';
    if (mobile) mobile.style.display = 'none';
}
</script>
@endsection
