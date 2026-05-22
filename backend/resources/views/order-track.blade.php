@extends('layouts.document')

@php
    $siteName = \App\Models\SiteSetting::get('site_name', 'Bake & Grill');
    $waLink = \App\Models\SiteSetting::get('business_whatsapp', 'https://wa.me/9609120011');
    $typeLabels = [
        'online_pickup' => 'Takeaway (Online)',
        'takeaway' => 'Takeaway',
        'delivery' => 'Delivery',
        'dine_in' => 'Dine-in',
    ];
    $typeLabel = $typeLabels[$order->type ?? ''] ?? str_replace('_', ' ', (string) ($order->type ?? ''));
    $step = match ($order->status) {
        'payment_pending', 'pending', 'paid' => 1,
        'in_progress', 'preparing', 'partial' => 2,
        'ready', 'out_for_delivery', 'picked_up', 'on_the_way' => 3,
        'completed', 'delivered' => 4,
        default => 1,
    };
@endphp

@section('doc_width', '520px')
@section('title', $siteName . ' — Order #' . ($order->order_number ?? ''))

@section('content')
<div class="doc-card">
    <p class="doc-eyebrow">Order tracking</p>
    <h1 class="doc-title">#{{ $order->order_number }}</h1>
    <p class="doc-subtitle">{{ $statusLabel }}</p>

    @if ($order->payment_status === 'paid' || $order->paid_at)
        <div class="doc-banner doc-banner--ok">Payment confirmed</div>
    @elseif ($order->status === 'payment_pending')
        <div class="doc-banner doc-banner--warn">Awaiting payment</div>
    @endif

    <div style="display:flex;justify-content:space-between;gap:8px;margin:1.25rem 0 1rem;text-align:center;font-size:0.75rem;font-weight:600;color:var(--muted);">
        @foreach (['Received', 'Preparing', 'Ready', 'Done'] as $i => $label)
            @php $n = $i + 1; $done = $step > $n; $active = $step === $n; @endphp
            <div style="flex:1;">
                <div style="width:1.75rem;height:1.75rem;border-radius:999px;margin:0 auto 0.35rem;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:800;color:{{ ($done || $active) ? '#fff' : 'var(--muted)' }};background:{{ ($done || $active) ? 'var(--amber)' : 'var(--surface)' }};border:2px solid {{ ($done || $active) ? 'var(--amber)' : 'var(--border)' }};">
                    {{ $done ? '✓' : $n }}
                </div>
                {{ $label }}
            </div>
        @endforeach
    </div>

    <div class="doc-meta">
        <div class="doc-meta-row"><span>Type</span><span>{{ $typeLabel }}</span></div>
        <div class="doc-meta-row"><span>Status</span><span>{{ $statusLabel }}</span></div>
        @if ($order->paid_at)
            <div class="doc-meta-row"><span>Paid</span><span>{{ $order->paid_at->timezone(config('app.timezone', 'Indian/Maldives'))->format('j M Y, g:i A') }}</span></div>
        @endif
    </div>

    <table class="doc-table">
        <thead>
            <tr><th>Item</th><th class="qty">Qty</th><th class="amount">MVR</th></tr>
        </thead>
        <tbody>
            @foreach ($order->items as $item)
                <tr>
                    <td>{{ $item->item_name }}</td>
                    <td class="qty">{{ $item->quantity }}</td>
                    <td class="amount">{{ number_format((float) $item->total_price, 2) }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <div class="doc-meta" style="margin-top:1rem;">
        @if ($order->subtotal !== null)
            <div class="doc-meta-row"><span>Subtotal</span><span>MVR {{ number_format((float) $order->subtotal, 2) }}</span></div>
        @endif
        @if ($order->tax_amount !== null)
            <div class="doc-meta-row"><span>GST</span><span>MVR {{ number_format((float) $order->tax_amount, 2) }}</span></div>
        @endif
        <div class="doc-meta-row" style="font-weight:800;color:var(--text);"><span>Total</span><span>MVR {{ number_format((float) $order->total, 2) }}</span></div>
    </div>

    @if ($isActive)
        <p style="margin-top:1rem;font-size:0.8125rem;color:var(--muted);text-align:center;">
            This page refreshes automatically every 30 seconds.
        </p>
    @endif

    <div style="margin-top:1.25rem;display:flex;gap:0.625rem;flex-wrap:wrap;">
        <a class="doc-btn doc-btn-primary" href="{{ $waLink }}?text={{ rawurlencode('Hi, I need help with order #' . $order->order_number) }}" target="_blank" rel="noopener">WhatsApp us</a>
        <a class="doc-btn" href="/order/menu">Order again</a>
    </div>
</div>
@endsection

@if ($isActive)
    @push('head')
        <meta http-equiv="refresh" content="30">
    @endpush
@endif
