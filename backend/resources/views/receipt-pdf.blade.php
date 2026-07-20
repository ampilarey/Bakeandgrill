@extends('layouts.pdf')

@php
    $typeLabels = [
        'dine_in' => 'Dine In',
        'takeaway' => 'Takeaway',
        'online_pickup' => 'Online Pickup',
        'delivery' => 'Delivery',
        'preorder' => 'Pre-order',
    ];
    $statusLabels = [
        'paid' => 'Paid',
        'completed' => 'Completed',
        'delivered' => 'Delivered',
        'refunded' => 'Refunded',
    ];
    $typeLabel = $typeLabels[$order->type ?? ''] ?? str_replace('_', ' ', (string) ($order->type ?? ''));
    $statusLabel = $statusLabels[$order->status ?? ''] ?? str_replace('_', ' ', (string) ($order->status ?? ''));
    $discount = (float) ($order->discount_amount ?? 0);
    $refunds = $order->refunds ?? collect();
    $refundedTotal = (float) $refunds->sum('amount');
    $isFullyRefunded = $refundedTotal > 0.0001 && in_array($order->status ?? '', ['refunded'], true);
    $netTotal = max(0, (float) $order->total - $refundedTotal);
    $tz = config('app.timezone', 'Indian/Maldives');
@endphp

@section('title', 'Receipt ' . ($order->order_number ?? ''))
@section('doc_type', 'Receipt')
@section('doc_number', $order->order_number ?? '')
@section('doc_status', $statusLabel)
@section('doc_status_class', ($order->status ?? '') === 'refunded' ? 'pending' : 'paid')

@section('meta')
<div class="pdf-meta-grid">
    <div class="pdf-meta-col">
        <div class="pdf-meta-label">Order details</div>
        <div class="pdf-meta-value"><strong>Type:</strong> {{ $typeLabel }}</div>
        <div class="pdf-meta-value"><strong>Placed:</strong> {{ optional($order->created_at)->timezone($tz)->format('d M Y, g:i A') }}</div>
    </div>
    <div class="pdf-meta-col">
        <div class="pdf-meta-label">Payment</div>
        @if ($order->paid_at)
            <div class="pdf-meta-value"><strong>Paid:</strong> {{ $order->paid_at->timezone($tz)->format('d M Y, g:i A') }}</div>
        @endif
        <div class="pdf-meta-value"><strong>Status:</strong> {{ ucfirst($statusLabel) }}</div>
    </div>
</div>
@endsection

@section('content')
<table class="pdf-table">
    <thead>
        <tr>
            <th>Item</th>
            <th class="center">Qty</th>
            <th class="right">MVR</th>
        </tr>
    </thead>
    <tbody>
        @foreach ($order->items as $item)
            <tr>
                <td>
                    <strong>{{ $item->item_name }}</strong>
                    @if ($item->variant_name)
                        <div class="pdf-mods">{{ $item->variant_name }}</div>
                    @endif
                    @if (!empty($item->packaging_option_name))
                        <div class="pdf-mods">+ {{ $item->packaging_option_name }}</div>
                    @endif
                    @if ($item->modifiers->count() > 0)
                        <div class="pdf-mods">{{ $item->modifiers->map(fn ($mod) => $mod->modifier_name)->join(', ') }}</div>
                    @endif
                    @if (!empty($item->notes))
                        <div class="pdf-mods"><em>{{ $item->notes }}</em></div>
                    @endif
                </td>
                <td class="center">{{ $item->quantity }}</td>
                <td class="right">{{ number_format((float) $item->total_price, 2) }}</td>
            </tr>
        @endforeach
    </tbody>
</table>

<div class="pdf-totals">
    <div class="pdf-totals-row"><span>Subtotal</span><span>MVR {{ number_format((float) $order->subtotal, 2) }}</span></div>
    @if ($discount > 0.0001)
        <div class="pdf-totals-row"><span>Discount</span><span>− MVR {{ number_format($discount, 2) }}</span></div>
    @endif
    @include('partials.order-service-charge-line', ['order' => $order, 'asPdf' => true])
    @if ((float) $order->tax_amount > 0.0001)
        <div class="pdf-totals-row"><span>GST</span><span>MVR {{ number_format((float) $order->tax_amount, 2) }}</span></div>
    @endif
    <div class="pdf-totals-grand"><span>Total</span><span>MVR {{ number_format((float) $order->total, 2) }}</span></div>
    @if ($refundedTotal > 0.0001)
        <div class="pdf-totals-row pdf-totals-refund"><span>Refunded</span><span>− MVR {{ number_format($refundedTotal, 2) }}</span></div>
        <div class="pdf-totals-grand"><span>{{ $isFullyRefunded ? 'Refunded total' : 'Amount paid' }}</span><span>MVR {{ number_format($netTotal, 2) }}</span></div>
    @endif
</div>

@if ($order->payments->count() > 0)
    <div class="pdf-section-title">Payments</div>
    @foreach ($order->payments as $p)
        @php
            $st = $p->status ?? 'paid';
            $showPay = in_array($st, ['paid', 'completed', 'confirmed'], true);
        @endphp
        @if ($showPay)
            <div class="pdf-payments-row">
                <span>{{ str_replace('_', ' ', ucfirst($p->method ?? 'Payment')) }}</span>
                <span>MVR {{ number_format((float) $p->amount, 2) }}</span>
            </div>
        @endif
    @endforeach
@endif
@endsection
