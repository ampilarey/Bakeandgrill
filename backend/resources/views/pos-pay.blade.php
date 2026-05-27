@extends('layouts.document')

@php
    $typeLabels = [
        'dine_in' => 'Dine In',
        'takeaway' => 'Takeaway',
        'online_pickup' => 'Online Pickup',
        'delivery' => 'Delivery',
        'preorder' => 'Pre-order',
    ];
    $typeLabel = $typeLabels[$order->type ?? ''] ?? str_replace('_', ' ', (string) ($order->type ?? ''));
    $discount = (float) ($order->discount_amount ?? 0);
    $deliveryFee = (float) ($order->delivery_fee ?? 0);
    $paidLaar = (int) $order->payments
        ->whereIn('status', ['confirmed', 'paid', 'completed'])
        ->sum(fn ($p) => $p->amount_laar ?? (int) round(((float) $p->amount) * 100));
    $paidMvr = round($paidLaar / 100, 2);
    $siteName = \App\Models\SiteSetting::get('site_name', 'Bake & Grill');
@endphp

@section('doc_width', '480px')
@section('title', $siteName . ' — Pay Order ' . ($order->order_number ?? ''))

@section('content')
<div class="doc-card">
    <div class="doc-card-body">
        <p class="doc-eyebrow">Secure payment</p>
        <h1 class="doc-title">Order {{ $order->order_number ?? '' }}</h1>
        <p class="doc-subtitle">Review your order below, agree to our terms, then pay securely with BML.</p>

        @if (session('error'))
            <div class="doc-alert doc-alert--error">{{ session('error') }}</div>
        @endif

        <div class="doc-banner doc-banner--warn">
            Amount due: <strong>MVR {{ number_format($amountDue, 2) }}</strong>
            @if ($paidMvr > 0)
                <span style="display:block;font-weight:500;margin-top:0.25rem;font-size:0.85rem;">
                    MVR {{ number_format($paidMvr, 2) }} already paid — you only pay the balance.
                </span>
            @endif
        </div>

        <div class="doc-meta">
            <div class="doc-meta-row"><span>Order type</span><span>{{ $typeLabel }}</span></div>
            <div class="doc-meta-row"><span>Placed</span><span>{{ optional($order->created_at)->timezone(config('app.timezone', 'Indian/Maldives'))->format('D, j M Y g:i A') }}</span></div>
        </div>

        <div class="doc-table-scroll">
            <table class="doc-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th class="qty">Qty</th>
                        <th class="amount">MVR</th>
                    </tr>
                </thead>
                <tbody>
                    @foreach ($order->items as $item)
                        <tr>
                            <td>
                                <strong>{{ $item->item_name }}</strong>
                                @if ($item->variant_name)
                                    <div class="doc-mods">{{ $item->variant_name }}</div>
                                @endif
                                @if ($item->modifiers->count() > 0)
                                    <div class="doc-mods">{{ $item->modifiers->map(fn ($mod) => $mod->modifier_name)->join(', ') }}</div>
                                @endif
                            </td>
                            <td class="qty">{{ $item->quantity }}</td>
                            <td class="amount">{{ number_format((float) $item->total_price, 2) }}</td>
                        </tr>
                    @endforeach
                </tbody>
            </table>
        </div>

        <div class="doc-totals">
            <p><span>Subtotal</span><span>MVR {{ number_format((float) $order->subtotal, 2) }}</span></p>
            @if ($deliveryFee > 0.0001)
                <p><span>Delivery fee</span><span>MVR {{ number_format($deliveryFee, 2) }}</span></p>
            @endif
            @if ((float) $order->tax_amount > 0.0001)
                <p><span>GST</span><span>MVR {{ number_format((float) $order->tax_amount, 2) }}</span></p>
            @endif
            @if ($discount > 0.0001)
                <p><span>Discount</span><span>− MVR {{ number_format($discount, 2) }}</span></p>
            @endif
            <p class="grand"><span>Order total</span><span>MVR {{ number_format((float) $order->total, 2) }}</span></p>
            @if ($paidMvr > 0)
                <p><span>Already paid</span><span>− MVR {{ number_format($paidMvr, 2) }}</span></p>
            @endif
            <p class="grand"><span>Amount to pay now</span><span>MVR {{ number_format($amountDue, 2) }}</span></p>
        </div>

        <form method="POST" action="{{ route('pos-pay.pay', $receipt->token) }}" style="margin-top:1.25rem;">
            @csrf
            <label class="doc-terms-label">
                <input type="checkbox" name="accept_terms" value="1" id="accept-terms" {{ old('accept_terms') ? 'checked' : '' }}>
                <span>
                    I agree to the
                    <a href="{{ url('/terms') }}" target="_blank" rel="noopener">Terms &amp; Conditions</a>,
                    <a href="{{ url('/refund') }}" target="_blank" rel="noopener">Refund Policy</a>, and
                    <a href="{{ url('/order/privacy') }}" target="_blank" rel="noopener">Privacy Policy</a>.
                </span>
            </label>
            @error('accept_terms')
                <div class="doc-alert doc-alert--error">{{ $message }}</div>
            @enderror
            <button type="submit" class="doc-btn doc-btn-primary doc-pay-btn" id="pay-btn" disabled>
                Pay MVR {{ number_format($amountDue, 2) }} securely
            </button>
        </form>

        <p class="doc-pay-note">
            You will be redirected to Bank of Maldives to complete payment.
        </p>
    </div>
</div>

@push('head')
<style>
    .doc-terms-label {
        display: flex;
        gap: 0.625rem;
        align-items: flex-start;
        font-size: 0.9rem;
        line-height: 1.5;
        cursor: pointer;
        margin-bottom: 1rem;
    }
    .doc-terms-label input {
        margin-top: 0.2rem;
        width: 1.1rem;
        height: 1.1rem;
        flex-shrink: 0;
        accent-color: var(--amber);
    }
    .doc-terms-label a {
        color: var(--amber);
        text-decoration: underline;
    }
    .doc-terms-label span {
        min-width: 0;
        overflow-wrap: anywhere;
    }
    .doc-pay-btn {
        width: 100%;
    }
    .doc-pay-note {
        margin-top: 1rem;
        font-size: 0.8rem;
        color: var(--muted);
        text-align: center;
        line-height: 1.45;
    }
</style>
@endpush

@push('scripts')
<script>
(function () {
    var terms = document.getElementById('accept-terms');
    var payBtn = document.getElementById('pay-btn');
    if (!terms || !payBtn) return;
    function sync() { payBtn.disabled = !terms.checked; }
    terms.addEventListener('change', sync);
    sync();
})();
</script>
@endpush
@endsection
