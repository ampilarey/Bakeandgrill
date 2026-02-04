@extends('layout')

@section('title', 'Pre-Order Confirmation - Bake & Grill')

@section('content')
<div style="max-width: 800px; margin: 5rem auto; padding: 0 2rem; text-align: center;">
    <div style="font-size: 5rem; margin-bottom: 1.5rem;">✅</div>
    <h1 style="font-size: 2.5rem; font-weight: 700; margin-bottom: 1rem; color: var(--dark);">Pre-Order Received!</h1>
    <p style="font-size: 1.2rem; color: #636e72; margin-bottom: 2rem;">Your pre-order request has been submitted successfully.</p>
    
    <div style="background: white; border: 2px solid #e9ecef; border-radius: 16px; padding: 2rem; text-align: left; margin-bottom: 2rem;">
        <h3 style="margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 2px solid #e9ecef;">Order Details</h3>
        
        <div style="margin-bottom: 1rem;">
            <strong>Order Number:</strong> {{ $preOrder->order_number }}
        </div>
        <div style="margin-bottom: 1rem;">
            <strong>Customer:</strong> {{ $preOrder->customer_name }}
        </div>
        <div style="margin-bottom: 1rem;">
            <strong>Phone:</strong> {{ str_replace('+960', '', $preOrder->customer_phone) }}
        </div>
        <div style="margin-bottom: 1rem;">
            <strong>Event Date:</strong> {{ \Carbon\Carbon::parse($preOrder->fulfillment_date)->format('l, F j, Y \a\t g:i A') }}
        </div>
        <div style="margin-bottom: 1rem;">
            <strong>Status:</strong> 
            <span style="background: #fff3cd; color: #856404; padding: 0.35rem 0.85rem; border-radius: 999px; font-size: 0.85rem; font-weight: 600;">
                Pending Approval
            </span>
        </div>
        
        <h4 style="margin: 1.5rem 0 1rem;">Items:</h4>
        @foreach($preOrder->items as $item)
            <div style="display: flex; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid #f0f0f0;">
                <span>{{ $item['name'] }} × {{ $item['quantity'] }}</span>
                <span style="font-weight: 600;">MVR {{ number_format($item['total'], 2) }}</span>
            </div>
        @endforeach
        
        <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 2px solid #e9ecef; display: flex; justify-content: space-between; font-size: 1.3rem;">
            <strong>Total:</strong>
            <strong style="color: var(--teal);">MVR {{ number_format($preOrder->total, 2) }}</strong>
        </div>
    </div>
    
    <div style="background: #e8f5f7; border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem;">
        <h4 style="margin-bottom: 0.75rem; color: var(--teal);">📱 What's Next?</h4>
        <p style="margin-bottom: 0.5rem;">1. Our team will review your pre-order</p>
        <p style="margin-bottom: 0.5rem;">2. We'll call you at {{ str_replace('+960', '', $preOrder->customer_phone) }} to confirm</p>
        <p>3. You'll receive SMS confirmation once approved</p>
    </div>
    
    <div style="display: flex; gap: 1rem; justify-content: center;">
        <a href="/" style="padding: 1rem 2rem; background: white; border: 2px solid var(--teal); color: var(--teal); border-radius: 999px; font-weight: 600;">
            ← Back to Home
        </a>
        <a href="/menu" style="padding: 1rem 2rem; background: var(--teal); color: white; border-radius: 999px; font-weight: 600;">
            Browse Menu
        </a>
    </div>
</div>
@endsection
