@extends('layout')
@section('title', 'Pre-Order for Event')
@section('content')

<style>
/* Hide number input arrows */
input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
}
input[type="number"] {
    -moz-appearance: textfield;
}
</style>

<div style="background: linear-gradient(135deg, rgba(27, 163, 185, 0.08), rgba(184, 168, 144, 0.08)); padding: 3rem 2rem; text-align: center;">
    <div style="font-size: 3.5rem; margin-bottom: 1rem;">📅</div>
    <h1 style="font-size: 2.5rem; font-weight: 700;">Pre-Order for Event</h1>
    <p style="font-size: 1.1rem; color: #636e72;">Order in advance for events</p>
</div>

<!-- Desktop Filters -->
<div id="desktopFilters" style="background: white; padding: 1.25rem 2rem; border-bottom: 1px solid #e9ecef;">
    <div style="max-width: 1400px; margin: 0 auto; display: flex; gap: 1.25rem; align-items: center;">
        <input type="text" id="searchInput" placeholder="🔍 Search..." onkeyup="filterItems()" style="flex: 1; min-width: 250px; padding: 0.7rem 1rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 0.95rem;">
        <select id="categoryFilter" onchange="filterItems()" style="padding: 0.7rem 1rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 0.95rem; cursor: pointer;">
            <option value="all">All Items</option>
            @php $cats = \App\Models\Category::with('children')->whereNull('parent_id')->get(); @endphp
            @foreach($cats as $m)
                <option value="cat-{{ $m->id }}">{{ $m->name }}</option>
                @foreach($m->children as $s)
                    <option value="cat-{{ $s->id }}">&nbsp;&nbsp;└─ {{ $s->name }}</option>
                @endforeach
            @endforeach
        </select>
        <select id="sortFilter" style="padding: 0.7rem 1rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 0.95rem; cursor: pointer;">
            <option value="popular">Popular</option>
            <option value="name">A-Z</option>
            <option value="price-low">Low Price</option>
            <option value="price-high">High Price</option>
        </select>
        <input type="number" id="minPrice" placeholder="Min" style="width: 75px; padding: 0.7rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 0.9rem;">
        <span style="color: #95a5a6;">–</span>
        <input type="number" id="maxPrice" placeholder="Max" style="width: 75px; padding: 0.7rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 0.9rem;">
        <button onclick="clearFilters()" style="padding: 0.7rem 1.25rem; background: #f8f9fa; border: 2px solid #e9ecef; border-radius: 8px; font-weight: 600; cursor: pointer;">✕</button>
    </div>
</div>

<!-- Mobile Filters (2 Rows) -->
<div id="mobileFilters" style="display: none; background: white; padding: 1rem; border-bottom: 1px solid #e9ecef;">
    <div>
        <div style="margin-bottom: 0.75rem;">
            <input type="text" id="mobileSearch" placeholder="🔍 Search..." onkeyup="document.getElementById('searchInput').value = this.value; filterItems()" style="width: 100%; padding: 0.85rem 1rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 1rem; box-sizing: border-box;">
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 0.8fr 0.8fr 0.6fr; gap: 0.5rem;">
            <select id="mobileCat" onchange="document.getElementById('categoryFilter').value = this.value; filterItems()" style="width: 100%; padding: 0.75rem 0.25rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 0.8rem; box-sizing: border-box;">
                <option value="all">All</option>
                @foreach($cats as $m)
                    <option value="cat-{{ $m->id }}">{{ $m->name }}</option>
                    @foreach($m->children as $s)
                        <option value="cat-{{ $s->id }}">{{ $s->name }}</option>
                    @endforeach
                @endforeach
            </select>
            <select style="width: 100%; padding: 0.75rem 0.25rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 0.8rem; box-sizing: border-box;">
                <option value="popular">★ Top</option>
                <option value="name">A-Z</option>
                <option value="price-low">Low ރ</option>
                <option value="price-high">High ރ</option>
            </select>
            <input type="number" placeholder="Min" style="width: 100%; padding: 0.75rem 0.25rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 0.75rem; text-align: center; box-sizing: border-box;">
            <input type="number" placeholder="Max" style="width: 100%; padding: 0.75rem 0.25rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 0.75rem; text-align: center; box-sizing: border-box;">
            <button onclick="clearFilters()" style="width: 100%; padding: 0.75rem 0.25rem; background: #f8f9fa; border: 2px solid #e9ecef; border-radius: 8px; font-weight: 600; font-size: 1.1rem; box-sizing: border-box;">✕</button>
        </div>
    </div>
</div>

<style>
@media (max-width: 768px) {
    #desktopFilters { display: none !important; }
    #mobileFilters { display: block !important; }
}
</style>

<div style="max-width: 1400px; margin: 2rem auto 4rem; padding: 0 2rem;">
    <form method="POST" action="{{ route('pre-order.store') }}">
        @csrf
        
            <!-- Step 1: Select Items -->
            <div style="margin-bottom: 2.5rem;">
                <h3 style="font-size: 2rem; margin-bottom: 1.5rem; font-weight: 700; color: var(--dark);">🍽️ Step 1: Select Items</h3>
            <div id="summary" style="display: none; background: #f8f9fa; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem;">
                <div id="summaryContent"></div>
                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 2px solid #e9ecef; font-size: 1.3rem; font-weight: 700; color: var(--teal);">Total: MVR <span id="total">0.00</span></div>
            </div>
            <div id="items" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem;">
                @foreach($items as $item)
                    <div data-id="{{ $item->id }}" data-name="{{ strtolower($item->name) }}" data-cat="cat-{{ $item->category_id }}" data-price="{{ $item->base_price }}" style="border: 2px solid #e9ecef; border-radius: 16px; overflow: hidden; transition: all 0.2s; background: white;">
                        <!-- Item Photo/Gradient -->
                        <div style="width: 100%; height: 140px; background: linear-gradient({{ 45 + ($loop->index * 30) }}deg, rgba({{ 100 + rand(0, 155) }}, {{ 150 + rand(0, 105) }}, {{ 200 + rand(0, 55) }}, 0.4), rgba({{ 150 + rand(0, 105) }}, {{ 100 + rand(0, 155) }}, {{ 200 + rand(0, 55) }}, 0.4)); display: flex; align-items: center; justify-content: center; font-size: 3rem;">
                            {{ ['🍔', '🍟', '🥤', '🍰', '☕', '🥗', '🍕', '🌮'][rand(0, 7)] }}
                        </div>
                        
                        <div style="padding: 1rem;">
                            <div style="font-weight: 600; margin-bottom: 0.5rem; font-size: 1.05rem;">{{ $item->name }}</div>
                            <div style="font-size: 0.85rem; color: #95a5a6; margin-bottom: 0.5rem;">{{ $item->category?->name }}</div>
                            <div style="font-weight: 700; color: var(--teal); margin-bottom: 1rem; font-size: 1.15rem;">MVR {{ number_format($item->base_price, 2) }}</div>
                        
                        <!-- Quantity Controls (Always Visible) -->
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <button type="button" onclick="decreaseQty({{ $item->id }})" style="width: 32px; height: 32px; border: 2px solid #e9ecef; border-radius: 50%; background: white; cursor: pointer; font-weight: 700; display: flex; align-items: center; justify-content: center;">−</button>
                            <input type="number" id="qty-{{ $item->id }}" name="items[{{ $item->id }}][quantity]" value="0" min="0" onchange="qtyChanged({{ $item->id }})" style="width: 50px; padding: 0.5rem; border: 2px solid #e9ecef; border-radius: 8px; text-align: center; font-weight: 600; font-size: 1rem;" disabled>
                            <button type="button" onclick="increaseQty({{ $item->id }})" style="width: 32px; height: 32px; border: 2px solid var(--teal); background: var(--teal); color: white; border-radius: 50%; cursor: pointer; font-weight: 700; display: flex; align-items: center; justify-content: center;">+</button>
                        </div>
                            <input type="hidden" name="items[{{ $item->id }}][item_id]" value="{{ $item->id }}" disabled>
                        </div>
                    </div>
                @endforeach
            </div>
        </div>

        <!-- Step 2: Contact -->
        <div style="background: white; border: 1px solid #e9ecef; border-radius: 16px; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
            <h3 style="font-size: 1.5rem; margin-bottom: 1.5rem; font-weight: 700;">📋 Step 2: Contact</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1rem;">
                <div><label style="font-weight: 600; display: block; margin-bottom: 0.5rem;">Name *</label><input type="text" name="customer_name" value="{{ str_replace('+960', '', session('customer_name', '')) }}" required style="width: 100%; padding: 0.85rem 1rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 1rem;"></div>
                <div><label style="font-weight: 600; display: block; margin-bottom: 0.5rem;">Phone *</label><input type="tel" name="customer_phone" value="{{ str_replace('+960', '', session('customer_phone', '')) }}" required style="width: 100%; padding: 0.85rem 1rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 1rem;"></div>
            </div>
            <div><label style="font-weight: 600; display: block; margin-bottom: 0.5rem;">Email</label><input type="email" name="customer_email" style="width: 100%; padding: 0.85rem 1rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 1rem;"></div>
        </div>

        <!-- Step 3: Event -->
        <div style="background: white; border: 1px solid #e9ecef; border-radius: 16px; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
            <h3 style="font-size: 1.5rem; margin-bottom: 1.5rem; font-weight: 700;">📅 Step 3: Event Details</h3>
            <div style="margin-bottom: 1rem;"><label style="font-weight: 600; display: block; margin-bottom: 0.5rem;">Date & Time *</label><input type="datetime-local" name="fulfillment_date" min="{{ now()->addHours(24)->format('Y-m-d\TH:i') }}" required style="width: 100%; padding: 0.85rem 1rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 1rem;"><small style="color: #95a5a6;">24hr advance notice</small></div>
            <div><label style="font-weight: 600; display: block; margin-bottom: 0.5rem;">Notes</label><textarea name="customer_notes" rows="3" style="width: 100%; padding: 0.85rem 1rem; border: 2px solid #e9ecef; border-radius: 8px; font-family: 'Poppins', sans-serif;"></textarea></div>
        </div>

        <button type="submit" style="width: 100%; padding: 1.25rem; background: var(--teal); color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 1.15rem; cursor: pointer; box-shadow: 0 4px 12px rgba(27, 163, 185, 0.3);">📅 Submit Pre-Order</button>
    </form>
</div>

<script>
function increaseQty(id) {
    const input = document.getElementById('qty-' + id);
    const card = document.querySelector(`[data-id="${id}"]`);
    const hidden = card.querySelector('input[type="hidden"]');
    
    input.value = parseInt(input.value) + 1;
    input.disabled = false;
    hidden.disabled = false;
    card.style.borderColor = 'var(--teal)';
    card.style.background = 'rgba(27, 163, 185, 0.05)';
    updateTotal();
}

function decreaseQty(id) {
    const input = document.getElementById('qty-' + id);
    const card = document.querySelector(`[data-id="${id}"]`);
    const hidden = card.querySelector('input[type="hidden"]');
    
    if (parseInt(input.value) > 0) {
        input.value = parseInt(input.value) - 1;
    }
    
    if (parseInt(input.value) === 0) {
        input.disabled = true;
        hidden.disabled = true;
        card.style.borderColor = '#e9ecef';
        card.style.background = 'white';
    }
    
    updateTotal();
}

function qtyChanged(id) {
    const input = document.getElementById('qty-' + id);
    const card = document.querySelector(`[data-id="${id}"]`);
    const hidden = card.querySelector('input[type="hidden"]');
    
    if (parseInt(input.value) > 0) {
        input.disabled = false;
        hidden.disabled = false;
        card.style.borderColor = 'var(--teal)';
        card.style.background = 'rgba(27, 163, 185, 0.05)';
    } else {
        input.disabled = true;
        hidden.disabled = true;
        card.style.borderColor = '#e9ecef';
        card.style.background = 'white';
    }
    
    updateTotal();
}
function updateTotal() {
    let total = 0;
    let html = '';
    
    document.querySelectorAll('[data-id]').forEach(card => {
        const id = card.getAttribute('data-id');
        const input = document.getElementById('qty-' + id);
        const qty = parseInt(input.value);
        
        if (qty > 0) {
            const name = card.querySelector('div').textContent;
            const price = parseFloat(card.getAttribute('data-price'));
            const lineTotal = price * qty;
            total += lineTotal;
            html += `<div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;"><span>${name} × ${qty}</span><span style="font-weight: 600;">MVR ${lineTotal.toFixed(2)}</span></div>`;
        }
    });
    
    document.getElementById('summaryContent').innerHTML = html;
    document.getElementById('total').textContent = total.toFixed(2);
    document.getElementById('summary').style.display = total > 0 ? 'block' : 'none';
}
function filterItems() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const cat = document.getElementById('categoryFilter').value;
    document.querySelectorAll('[data-name]').forEach(item => {
        const name = item.getAttribute('data-name');
        const itemCat = item.getAttribute('data-cat');
        const show = (!search || name.includes(search)) && (cat === 'all' || !cat || itemCat === cat);
        item.style.display = show ? 'block' : 'none';
    });
}
function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('categoryFilter').value = 'all';
    filterItems();
}
</script>
@endsection
