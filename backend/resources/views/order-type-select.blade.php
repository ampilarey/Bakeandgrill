@extends('layout')

@section('title', 'Choose Order Type - Bake & Grill')

@section('styles')
<style>
    .order-type-container {
        min-height: 70vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 3rem 2rem;
        background: linear-gradient(135deg, rgba(27, 163, 185, 0.08), rgba(184, 168, 144, 0.08));
    }

    .order-type-box {
        max-width: 1000px;
        width: 100%;
    }

    .order-type-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 2rem;
        margin-top: 2rem;
    }

    .order-type-card {
        background: white;
        border: 2px solid #e9ecef;
        border-radius: 20px;
        padding: 3rem 2rem;
        text-align: center;
        cursor: pointer;
        transition: all 0.3s;
        box-shadow: 0 4px 12px rgba(0,0,0,0.06);
    }

    .order-type-card:hover {
        transform: translateY(-8px);
        box-shadow: 0 12px 32px rgba(0,0,0,0.12);
        border-color: var(--teal);
    }

    .order-type-icon {
        font-size: 4rem;
        margin-bottom: 1.5rem;
    }

    .order-type-card h3 {
        font-size: 1.6rem;
        font-weight: 700;
        margin-bottom: 0.75rem;
        color: var(--dark);
    }

    .order-type-card p {
        color: #636e72;
        line-height: 1.6;
        margin-bottom: 1.25rem;
    }

    .order-type-card .badge {
        display: inline-block;
        padding: 0.4rem 1rem;
        background: rgba(27, 163, 185, 0.1);
        color: var(--teal);
        border-radius: 999px;
        font-size: 0.85rem;
        font-weight: 600;
    }
</style>
@endsection

@section('content')
<div class="order-type-container">
    <div class="order-type-box">
        <div style="text-align: center; margin-bottom: 3rem;">
            <h1 style="font-size: 2.5rem; font-weight: 700; margin-bottom: 0.75rem; color: var(--dark);">
                How would you like to order?
            </h1>
            <p style="font-size: 1.1rem; color: #636e72;">
                @if(session('customer_name'))
                    Welcome back, {{ session('customer_name') }}!
                @else
                    Choose your preferred ordering method
                @endif
            </p>
        </div>

        <div class="order-type-grid">
            <!-- Takeaway -->
            <a href="/menu?order_type=takeaway" class="order-type-card" onclick="sessionStorage.setItem('orderType', 'takeaway')">
                <div class="order-type-icon">🥡</div>
                <h3>Takeaway</h3>
                <p>Order now and pick up at the café</p>
                <span class="badge">Quick Pickup</span>
            </a>

            <!-- Delivery -->
            <a href="/menu?order_type=delivery" class="order-type-card" onclick="sessionStorage.setItem('orderType', 'delivery')">
                <div class="order-type-icon">🛵</div>
                <h3>Delivery</h3>
                <p>We'll deliver to your location</p>
                <span class="badge">30-45 mins</span>
            </a>

            <!-- Event Pre-Order -->
            <a href="/pre-order" class="order-type-card">
                <div class="order-type-icon">📅</div>
                <h3>Event Pre-Order</h3>
                <p>Order in advance for parties & events</p>
                <span class="badge">24hrs advance</span>
            </a>
        </div>

        @if(!session('customer_id'))
            <p style="text-align: center; margin-top: 2rem; color: #636e72;">
                <a href="/customer/login" style="color: var(--teal); font-weight: 600;">Login</a> to track your orders
            </p>
        @endif
    </div>
</div>
@endsection
