@extends('layout')

@section('title', 'Checkout - Bake & Grill')

@section('styles')
<style>
    .checkout-container {
        max-width: 1000px;
        margin: 3rem auto 4rem;
        padding: 0 2rem;
    }

    .checkout-section {
        background: white;
        border: 1px solid #e9ecef;
        border-radius: 16px;
        padding: 2rem;
        margin-bottom: 2rem;
        box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }

    .checkout-section h2 {
        font-size: 1.5rem;
        font-weight: 700;
        margin-bottom: 1.5rem;
        color: var(--dark);
    }

    .cart-item {
        display: flex;
        justify-content: space-between;
        padding: 1rem 0;
        border-bottom: 1px solid #f0f0f0;
    }

    .cart-item:last-child {
        border-bottom: none;
    }

    .place-order-btn {
        width: 100%;
        padding: 1.5rem;
        background: var(--teal);
        color: white;
        border: none;
        border-radius: 12px;
        font-weight: 700;
        font-size: 1.2rem;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 4px 12px rgba(27, 163, 185, 0.3);
    }

    .place-order-btn:hover {
        background: var(--teal-hover);
        transform: translateY(-2px);
    }
</style>
@endsection

@section('content')
<div class="checkout-container">
    <h1 style="font-size: 2.5rem; font-weight: 700; margin-bottom: 2rem; text-align: center;">
        Checkout
    </h1>

    <div class="checkout-section">
        <h2>📦 Your Order</h2>
        <div id="checkoutItems"></div>
        <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 2px solid #e9ecef; display: flex; justify-content: space-between; font-size: 1.5rem; font-weight: 700;">
            <span>Total:</span>
            <span style="color: var(--teal);">MVR <span id="checkoutTotal">0.00</span></span>
        </div>
    </div>

    <div class="checkout-section">
        <h2>📝 Order Details</h2>
        
        @if(!session('customer_id'))
            <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
                <strong>Please login to continue</strong>
                <div style="margin-top: 0.5rem;">
                    <a href="/customer/login" style="color: var(--teal); font-weight: 600;">Login here →</a>
                </div>
            </div>
        @endif
        
        <div style="margin-bottom: 1.5rem;">
            <label style="display: block; font-weight: 600; margin-bottom: 0.75rem; font-size: 1.1rem;">
                How would you like to receive your order? *
            </label>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                <div onclick="selectOrderType('takeaway')" id="type-takeaway" style="padding: 1.25rem; border: 2px solid #e9ecef; border-radius: 12px; cursor: pointer; text-align: center; transition: all 0.2s;">
                    <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🥡</div>
                    <strong>Takeaway</strong>
                    <div style="font-size: 0.85rem; color: #95a5a6; margin-top: 0.25rem;">Pick up at café</div>
                </div>
                <div onclick="selectOrderType('delivery')" id="type-delivery" style="padding: 1.25rem; border: 2px solid #e9ecef; border-radius: 12px; cursor: pointer; text-align: center; transition: all 0.2s;">
                    <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🛵</div>
                    <strong>Delivery</strong>
                    <div style="font-size: 0.85rem; color: #95a5a6; margin-top: 0.25rem;">30-45 minutes</div>
                </div>
            </div>
            <input type="hidden" id="selectedOrderType" value="takeaway">
        </div>
        
        <!-- Delivery Address (shows only when delivery selected) -->
        <div id="deliveryAddressSection" style="display: none; margin-top: 1.5rem; padding: 1.5rem; background: #f8f9fa; border-radius: 12px;">
            <h4 style="font-weight: 700; margin-bottom: 1rem; color: var(--dark);">📍 Delivery Address</h4>
            
            @php
                $customer = session('customer_id') ? \App\Models\Customer::find(session('customer_id')) : null;
            @endphp
            
            <div style="margin-bottom: 1rem;">
                <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Street Address *</label>
                <input type="text" id="deliveryAddress" value="{{ $customer?->delivery_address ?? '' }}" placeholder="e.g., Majeedhee Magu" style="width: 100%; padding: 0.75rem 1rem; border: 2px solid #e9ecef; border-radius: 8px; font-size: 1rem;">
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                <div>
                    <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Area/District</label>
                    <input type="text" id="deliveryArea" value="{{ $customer?->delivery_area ?? '' }}" placeholder="e.g., Henveiru" style="width: 100%; padding: 0.75rem 1rem; border: 2px solid #e9ecef; border-radius: 8px;">
                </div>
                <div>
                    <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Building/House</label>
                    <input type="text" id="deliveryBuilding" value="{{ $customer?->delivery_building ?? '' }}" placeholder="e.g., Moonlight" style="width: 100%; padding: 0.75rem 1rem; border: 2px solid #e9ecef; border-radius: 8px;">
                </div>
            </div>
            
            <div style="margin-bottom: 1rem;">
                <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Floor/Apartment (optional)</label>
                <input type="text" id="deliveryFloor" value="{{ $customer?->delivery_floor ?? '' }}" placeholder="e.g., 3rd Floor, Apt 5" style="width: 100%; padding: 0.75rem 1rem; border: 2px solid #e9ecef; border-radius: 8px;">
            </div>
            
            <div>
                <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">Delivery Instructions (optional)</label>
                <textarea id="deliveryInstructions" rows="2" placeholder="e.g., Call when arrived, Ring bell twice..." style="width: 100%; padding: 0.75rem 1rem; border: 2px solid #e9ecef; border-radius: 8px; font-family: 'Poppins', sans-serif;">{{ $customer?->delivery_notes ?? '' }}</textarea>
            </div>
            
            <label style="display: flex; align-items: center; margin-top: 1rem; cursor: pointer;">
                <input type="checkbox" id="saveAddress" {{ $customer?->delivery_address ? 'checked' : '' }} style="width: 20px; height: 20px; margin-right: 0.5rem; cursor: pointer;">
                <span style="font-weight: 500;">Save this address for future orders</span>
            </label>
        </div>
        
        <div style="margin-bottom: 1rem;">
            <strong>Name:</strong> {{ session('customer_name', 'Guest') }}
        </div>
        <div style="margin-bottom: 1rem;">
            <strong>Phone:</strong> {{ session('customer_phone') ? str_replace('+960', '', session('customer_phone')) : 'N/A' }}
        </div>
        <div>
            <label style="display: block; font-weight: 600; margin-bottom: 0.5rem;">Special Instructions:</label>
            <textarea id="orderNotes" rows="3" style="width: 100%; padding: 1rem; border: 2px solid #e9ecef; border-radius: 8px; font-family: 'Poppins', sans-serif;" placeholder="Any special requests..."></textarea>
        </div>
    </div>

    <div id="cartTimer" style="text-align: center; margin-bottom: 1.5rem; padding: 1rem; background: #fff3cd; border-radius: 8px; font-weight: 700; color: #856404; font-size: 1.1rem;">
        ⏰ Time remaining: <span id="timeRemaining">0:30</span>
    </div>
    
    <style>
        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.02); }
        }
    </style>

    <button class="place-order-btn" onclick="placeOrder()">
        🛒 Place Order
    </button>

    <p style="text-align: center; margin-top: 1.5rem;">
        <a href="/menu" style="color: var(--teal); font-weight: 600;">← Back to Menu</a>
    </p>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing checkout...');
    
    // Load cart and display
    const cart = JSON.parse(localStorage.getItem('bakegrill_cart') || '[]');

    console.log('Cart loaded:', cart);
    console.log('Number of items:', cart.length);

// Order type selection
function selectOrderType(type) {
    document.querySelectorAll('[id^="type-"]').forEach(el => {
        el.style.borderColor = '#e9ecef';
        el.style.background = 'white';
    });
    
    const selected = document.getElementById('type-' + type);
    if (selected) {
        selected.style.borderColor = '#1ba3b9';
        selected.style.background = 'rgba(27, 163, 185, 0.05)';
    }
    
    document.getElementById('selectedOrderType').value = type;
    
    // Show/hide delivery address section
    const deliverySection = document.getElementById('deliveryAddressSection');
    if (deliverySection) {
        deliverySection.style.display = type === 'delivery' ? 'block' : 'none';
    }
}

// Display cart items
let total = 0;
let html = '';

console.log('Checkout page loaded');
console.log('Cart from localStorage:', cart);
console.log('Cart has items:', cart.length);

if (!cart || cart.length === 0) {
    html = '<div style="text-align: center; padding: 3rem; color: #95a5a6;"><div style="font-size: 3rem; margin-bottom: 1rem;">🛒</div><p>Your cart is empty</p><a href="/menu" style="color: var(--teal); font-weight: 600; margin-top: 1rem; display: inline-block;">Browse Menu →</a></div>';
} else {
    cart.forEach((item, index) => {
        const lineTotal = item.price * item.quantity;
        total += lineTotal;
        
        // Stock info will be added dynamically
        html += `
            <div class="cart-item" id="cart-item-${item.id}">
                <div style="flex: 1;">
                    <strong style="font-size: 1.1rem; display: block; margin-bottom: 0.25rem;">${item.name}</strong>
                    <div id="stock-info-${item.id}" style="font-size: 0.85rem; color: #95a5a6; margin-bottom: 0.5rem;">Loading stock...</div>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <button onclick="updateQuantity(${index}, -1)" style="width: 36px; height: 36px; border: 2px solid #e9ecef; border-radius: 50%; background: white; cursor: pointer; font-weight: 700; font-size: 1.2rem; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" onmouseover="this.style.borderColor='#1ba3b9'; this.style.background='#f8f9fa'" onmouseout="this.style.borderColor='#e9ecef'; this.style.background='white'">
                            −
                        </button>
                        <span style="font-weight: 600; font-size: 1.1rem; min-width: 30px; text-align: center;">${item.quantity}</span>
                        <button onclick="updateQuantity(${index}, 1)" style="width: 36px; height: 36px; border: 2px solid #1ba3b9; border-radius: 50%; background: #1ba3b9; color: white; cursor: pointer; font-weight: 700; font-size: 1.2rem; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" onmouseover="this.style.background='#148a9d'" onmouseout="this.style.background='#1ba3b9'">
                            +
                        </button>
                        <button onclick="removeItem(${index})" style="padding: 0.4rem 0.75rem; border: 1px solid #e74c3c; background: white; color: #e74c3c; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 600; margin-left: 0.5rem;" onmouseover="this.style.background='#fff5f5'" onmouseout="this.style.background='white'">
                            Remove
                        </button>
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: 700; color: var(--teal); font-size: 1.2rem;">MVR ${lineTotal.toFixed(2)}</div>
                    <div style="font-size: 0.85rem; color: #95a5a6;">MVR ${parseFloat(item.price).toFixed(2)} each</div>
                </div>
            </div>
        `;
    });
}

    const itemsContainer = document.getElementById('checkoutItems');
    const totalContainer = document.getElementById('checkoutTotal');

    console.log('Items container found:', itemsContainer ? 'yes' : 'NO!');
    console.log('Total container found:', totalContainer ? 'yes' : 'NO!');
    console.log('HTML to display:', html);

    if (itemsContainer) {
        itemsContainer.innerHTML = html;
        console.log('✓ Items displayed');
    } else {
        console.error('ERROR: checkoutItems element not found!');
    }

    if (totalContainer) {
        totalContainer.textContent = total.toFixed(2);
        console.log('✓ Total set:', total.toFixed(2));
    } else {
        console.error('ERROR: checkoutTotal element not found!');
    }

    // Load stock info for cart items
    if (cart.length > 0) {
        const itemIds = cart.map(item => item.id);
        console.log('Fetching stock for items:', itemIds);
        
        fetch('/api/items/stock-check', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ item_ids: itemIds })
        })
        .then(res => {
            console.log('Stock API response status:', res.status);
            return res.json();
        })
        .then(data => {
            console.log('Stock data received:', data);
            
            if (data.items) {
                data.items.forEach(item => {
                    const stockEl = document.getElementById('stock-info-' + item.id);
                    console.log('Updating stock for item', item.id, ':', stockEl ? 'found' : 'NOT FOUND');
                    
                    if (stockEl) {
                        if (item.availability_type === 'made_to_order') {
                            stockEl.innerHTML = '<span style="color: #27ae60; font-weight: 600;">✓ Made to Order</span>';
                        } else if (item.track_stock) {
                            const color = item.stock_quantity <= item.low_stock_threshold ? '#e67e22' : '#27ae60';
                            stockEl.innerHTML = `<span style="color: ${color}; font-weight: 600;">📦 ${item.stock_quantity} units available</span>`;
                        } else {
                            stockEl.innerHTML = '<span style="color: #27ae60;">✓ Available</span>';
                        }
                    }
                });
            }
        })
        .catch(err => {
            console.error('Failed to load stock:', err);
        });
    }
    
    // Auto-select takeaway on load
    setTimeout(() => selectOrderType('takeaway'), 100);
    
    // Show countdown timer
    function updateTimer() {
        const cartExpiry = localStorage.getItem('cart_expiry');
        if (!cartExpiry) return;
        
        const now = Date.now();
        const remaining = parseInt(cartExpiry) - now;
        
        if (remaining <= 0) {
            localStorage.removeItem('bakegrill_cart');
            localStorage.removeItem('cart_expiry');
            alert('⏰ Cart expired! Please add items again.');
            window.location.href = '/menu';
            return;
        }
        
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        
        const timerEl = document.getElementById('timeRemaining');
        if (timerEl) {
            timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            // Change color if less than 10 seconds
            const timerBox = document.getElementById('cartTimer');
            if (remaining < 10000) {
                timerBox.style.background = '#f8d7da';
                timerBox.style.color = '#721c24';
                timerBox.style.animation = 'pulse 0.5s infinite';
            }
        }
        
        setTimeout(updateTimer, 1000);
    }
    
    updateTimer();
    
    // Make functions global
    window.updateQuantity = updateQuantity;
    window.removeItem = removeItem;
    window.selectOrderType = selectOrderType;
    window.placeOrder = placeOrder;
});

function updateQuantity(index, change) {
    const cart = JSON.parse(localStorage.getItem('bakegrill_cart') || '[]');
    
    if (cart[index]) {
        cart[index].quantity += change;
        
        if (cart[index].quantity <= 0) {
            cart.splice(index, 1);
        }
        
        localStorage.setItem('bakegrill_cart', JSON.stringify(cart));
        console.log('Cart updated:', cart);
        
        // Reload page to refresh display
        window.location.reload();
    }
}

function removeItem(index) {
    const cart = JSON.parse(localStorage.getItem('bakegrill_cart') || '[]');
    cart.splice(index, 1);
    localStorage.setItem('bakegrill_cart', JSON.stringify(cart));
    window.location.reload();
}

function placeOrder() {
    const cart = JSON.parse(localStorage.getItem('bakegrill_cart') || '[]');
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    if (cart.length === 0) {
        alert('Cart is empty');
        return;
    }

    // Here you would submit to API
    // For now, show confirmation
    if (confirm(`Place order for MVR ${total.toFixed(2)}?`)) {
        // Clear cart
        localStorage.removeItem('bakegrill_cart');
        
        // Show success and redirect
        alert('Order placed successfully! We will contact you shortly.');
        window.location.href = '/';
    }
}
</script>
@endsection
