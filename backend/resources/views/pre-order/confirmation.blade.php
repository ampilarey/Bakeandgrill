@extends('layout')

@section('title', 'Pre-Order Confirmation — Bake & Grill')

@section('content')
<div style="max-width: 720px; margin: 4rem auto; padding: 0 1.25rem; text-align: center;">
    <div style="font-size: 3.5rem; margin-bottom: 1rem;">✅</div>
    <h1 style="font-size: clamp(1.75rem, 4vw, 2.25rem); font-weight: 800; margin-bottom: 0.75rem; color: var(--dark); letter-spacing: -0.02em;">Pre-Order Received!</h1>
    <p style="font-size: 1.05rem; color: var(--muted, #8B7355); margin-bottom: 2rem;">Your pre-order request has been submitted successfully.</p>

    <div style="background: var(--surface, #fff); border: 1px solid var(--border, #EDE4D4); border-radius: 16px; padding: 1.5rem; text-align: left; margin-bottom: 1.5rem; box-shadow: 0 2px 12px rgba(28, 20, 8, 0.06);">
        <h3 style="margin-bottom: 1.25rem; padding-bottom: 0.75rem; border-bottom: 2px solid var(--border, #EDE4D4); font-size: 1rem; color: var(--muted, #8B7355); text-transform: uppercase; letter-spacing: 0.04em;">Order Details</h3>

        <div style="margin-bottom: 0.75rem;"><strong>Order Number:</strong> {{ $preOrder->order_number }}</div>
        <div style="margin-bottom: 0.75rem;"><strong>Customer:</strong> {{ $preOrder->customer_name }}</div>
        <div style="margin-bottom: 0.75rem;"><strong>Phone:</strong> {{ str_replace('+960', '', $preOrder->customer_phone) }}</div>
        <div style="margin-bottom: 0.75rem;"><strong>Event Date:</strong> {{ \Carbon\Carbon::parse($preOrder->fulfillment_date)->format('l, F j, Y \a\t g:i A') }}</div>
        <div style="margin-bottom: 0.75rem;">
            <strong>Status:</strong>
            <span style="background: var(--warn-bg, #fffbeb); color: var(--warn-text, #92400e); padding: 0.35rem 0.85rem; border-radius: 999px; font-size: 0.85rem; font-weight: 600; border: 1px solid var(--warn-border, #fcd34d);">
                Pending Approval
            </span>
        </div>

        <h4 style="margin: 1.25rem 0 0.75rem; font-size: 0.9rem; color: var(--muted, #8B7355);">Items</h4>
        @foreach($preOrder->items as $item)
            <div style="display: flex; justify-content: space-between; padding: 0.625rem 0; border-bottom: 1px solid var(--border, #EDE4D4);">
                <span>{{ $item['name'] }} × {{ $item['quantity'] }}</span>
                <span style="font-weight: 700;">MVR {{ number_format($item['total'], 2) }}</span>
            </div>
        @endforeach

        <div style="margin-top: 1.25rem; padding-top: 1rem; border-top: 2px solid var(--border, #EDE4D4); display: flex; justify-content: space-between; font-size: 1.2rem; font-weight: 800;">
            <span>Total</span>
            <span style="color: var(--amber);">MVR {{ number_format($preOrder->total, 2) }}</span>
        </div>
    </div>

    <div style="background: var(--amber-light); border: 1px solid var(--border, #EDE4D4); border-radius: 12px; padding: 1.25rem; margin-bottom: 1.5rem; text-align: left;">
        <h4 style="margin-bottom: 0.75rem; color: var(--amber); font-size: 1rem;">What's Next?</h4>
        <p style="margin-bottom: 0.5rem;">1. Our team will review your pre-order</p>
        <p style="margin-bottom: 0.5rem;">2. We'll call you at {{ str_replace('+960', '', $preOrder->customer_phone) }} to confirm</p>
        <p style="margin-bottom: 0;">3. You'll receive SMS confirmation once approved</p>
    </div>

    <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
        <a href="/" style="padding: 0.875rem 1.5rem; background: var(--surface, #fff); border: 2px solid var(--amber); color: var(--amber); border-radius: 999px; font-weight: 700; min-height: 44px; display: inline-flex; align-items: center;">← Back to Home</a>
        <a href="/order/menu" style="padding: 0.875rem 1.5rem; background: var(--amber); color: #fff; border-radius: 999px; font-weight: 700; min-height: 44px; display: inline-flex; align-items: center;">Browse Menu</a>
    </div>
</div>
@endsection
