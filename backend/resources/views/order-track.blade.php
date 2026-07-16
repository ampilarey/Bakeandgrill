@extends('layouts.document')

@php
    $siteName = \App\Models\SiteSetting::get('site_name', 'Bake & Grill');
    $waLink = \App\Models\SiteSetting::get('business_whatsapp', 'https://wa.me/9609120011');
    $typeLabels = [
        'online_pickup' => 'Online Pickup',
        'takeaway' => 'Takeaway',
        'delivery' => 'Delivery',
        'dine_in' => 'Dine-in',
    ];
    $typeLabel = $typeLabels[$order->type ?? ''] ?? str_replace('_', ' ', (string) ($order->type ?? ''));
    $settlement = \App\Support\OrderSettlement::forOrder($order);
    $paidOnCredit = $settlement['paid_on_credit'] ?? false;
    $step = match ($order->status) {
        'payment_pending', 'pending', 'paid' => 1,
        'in_progress', 'preparing', 'partial' => 2,
        'ready', 'out_for_delivery', 'picked_up', 'on_the_way' => 3,
        'completed', 'delivered' => 4,
        default => 1,
    };
    $orderRef = $order->order_number ?? (string) $order->id;
    $mistakeMsg = 'Hi Bake & Grill — I think there\'s a mistake on order '.$orderRef
        .' for MVR '.number_format((float) $order->total, 2)
        .'. Mistake: ';
@endphp

@section('title', $siteName . ' — Order #' . ($order->order_number ?? ''))

@section('content')
<div class="doc-card">
    @include('partials.document-masthead', [
        'docType' => 'Order tracking',
        'docNumber' => $order->order_number ?? '',
        'docBadge' => $statusLabel ?? null,
        'docBadgeClass' => 'doc-badge--sent',
    ])

    <div class="doc-card-body">
        <p class="doc-subtitle">{{ $statusLabel }}</p>

        @if ($paidOnCredit)
            <div class="doc-banner doc-banner--ok">Charged to your credit account — balance due on your monthly statement</div>
        @elseif ($order->payment_status === 'paid' || $order->paid_at)
            <div class="doc-banner doc-banner--ok">Payment confirmed</div>
        @elseif ($order->status === 'payment_pending')
            <div class="doc-banner doc-banner--warn">Awaiting payment</div>
        @endif

        <div class="doc-progress">
            @foreach (['Received', 'Preparing', 'Ready', 'Done'] as $i => $label)
                @php
                    $n = $i + 1;
                    $done = $step > $n;
                    $active = $step === $n;
                @endphp
                <div class="doc-progress-step">
                    <div class="doc-progress-dot {{ $done ? 'is-done' : ($active ? 'is-active' : '') }}">
                        {{ $done ? '✓' : $n }}
                    </div>
                    <span class="doc-progress-label">{{ $label }}</span>
                </div>
            @endforeach
        </div>

        <div class="doc-meta">
            <div class="doc-meta-row"><span>Type</span><span>{{ $typeLabel }}</span></div>
            <div class="doc-meta-row"><span>Status</span><span>{{ $statusLabel }}</span></div>
            @if ($order->paid_at)
                <div class="doc-meta-row"><span>{{ $paidOnCredit ? 'Charged' : 'Paid' }}</span><span>{{ $order->paid_at->timezone(config('app.timezone', 'Indian/Maldives'))->format('j M Y, g:i A') }}</span></div>
            @endif
        </div>

        <div class="doc-table-scroll">
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
        </div>

        <div class="doc-totals">
            @if ($order->subtotal !== null)
                <p><span>Subtotal</span><span>MVR {{ number_format((float) $order->subtotal, 2) }}</span></p>
            @endif
            @if ($order->tax_amount !== null)
                <p><span>GST</span><span>MVR {{ number_format((float) $order->tax_amount, 2) }}</span></p>
            @endif
            <p class="grand"><span>Total</span><span>MVR {{ number_format((float) $order->total, 2) }}</span></p>
        </div>

        @if ($isActive)
            <p class="doc-pay-note">
                This page refreshes automatically every 30 seconds.
            </p>
        @endif

        <div class="doc-actions">
            <a class="doc-btn" href="/order/menu">Order again</a>
        </div>

        <div class="doc-mistake-cta" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border, #e5e7eb); text-align: center;">
            <a class="doc-btn doc-btn-primary" style="width: 100%;" href="{{ $waLink }}?text={{ rawurlencode($mistakeMsg) }}" target="_blank" rel="noopener">
                Something wrong with this order?
            </a>
            <p class="doc-subtitle" style="margin: 0.5rem 0 0;">
                Message us on WhatsApp and we’ll fix it.
            </p>
        </div>
    </div>
</div>
@endsection

@if ($isActive)
    @push('head')
        <meta http-equiv="refresh" content="30">
    @endpush
@endif
