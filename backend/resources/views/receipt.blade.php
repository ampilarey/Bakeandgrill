@extends('layouts.document')

@php
    $order = $receipt->order;
    $settlement = \App\Support\OrderSettlement::forOrder($order);
    $paidOnCredit = $settlement['paid_on_credit'] ?? false;
    $isPaid = $order->paid_at !== null
        || in_array($order->status ?? '', ['paid', 'completed', 'delivered', 'refunded'], true);
    $docTitle = $isPaid ? 'Receipt' : 'Invoice';
    $typeLabels = [
        'dine_in' => 'Dine In',
        'takeaway' => 'Takeaway',
        'online_pickup' => 'Online Pickup',
        'delivery' => 'Delivery',
        'preorder' => 'Pre-order',
    ];
    $statusLabels = [
        'payment_pending' => 'Awaiting payment',
        'pending' => 'Pending',
        'paid' => 'Paid',
        'partial' => 'Partially paid',
        'in_progress' => 'In progress',
        'preparing' => 'Preparing',
        'ready' => 'Ready',
        'held' => 'On hold',
        'completed' => 'Completed',
        'delivered' => 'Delivered',
        'cancelled' => 'Cancelled',
        'refunded' => 'Refunded',
    ];
    $typeLabel = $typeLabels[$order->type ?? ''] ?? str_replace('_', ' ', (string) ($order->type ?? ''));
    $statusLabel = $statusLabels[$order->status ?? ''] ?? str_replace('_', ' ', (string) ($order->status ?? ''));
    $discount = (float) ($order->discount_amount ?? 0);
    $refunds = $order->refunds ?? collect();
    $refundedTotal = (float) $refunds->sum('amount');
    $isFullyRefunded = $refundedTotal > 0.0001 && in_array($order->status ?? '', ['refunded'], true);
    $netTotal = max(0, (float) $order->total - $refundedTotal);
    $siteName = \App\Models\SiteSetting::get('site_name', 'Bake & Grill');
@endphp

@section('doc_width', '480px')
@section('title', $siteName . ' — ' . $docTitle . ' ' . ($order->order_number ?? ''))

@section('content')
<div class="doc-card">
    <p class="doc-eyebrow">{{ $docTitle }}</p>
    <h1 class="doc-title">Order {{ $order->order_number ?? '' }}</h1>
    <p class="doc-subtitle">Thank you for choosing {{ $siteName }}.</p>

    @if (session('success'))
        <div class="doc-alert doc-alert--success">{{ session('success') }}</div>
    @endif
    @if (session('error'))
        <div class="doc-alert doc-alert--error">{{ session('error') }}</div>
    @endif

    @if (!$isPaid)
        <div class="doc-banner doc-banner--warn">
            Payment pending — this is your bill. Totals may update until payment is received. Refresh after you pay to see your receipt.
        </div>
    @else
        <div class="doc-banner doc-banner--ok">
            @if ($paidOnCredit)
                Charged to credit account
            @else
                Payment confirmed
            @endif
            @if ($order->paid_at)
                — {{ $order->paid_at->timezone(config('app.timezone', 'Indian/Maldives'))->format('D, j M Y g:i A') }}
            @endif
        </div>
    @endif

    <div class="doc-meta">
        <div class="doc-meta-row"><span>Order type</span><span>{{ $typeLabel }}</span></div>
        <div class="doc-meta-row"><span>Status</span><span style="text-transform: capitalize">{{ $statusLabel }}</span></div>
        <div class="doc-meta-row"><span>Placed</span><span>{{ optional($order->created_at)->timezone(config('app.timezone', 'Indian/Maldives'))->format('D, j M Y g:i A') }}</span></div>
    </div>

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
                        @if (!empty($item->notes))
                            <div class="doc-mods" style="font-style: italic;">↳ {{ $item->notes }}</div>
                        @endif
                    </td>
                    <td class="qty">{{ $item->quantity }}</td>
                    <td class="amount">{{ number_format((float) $item->total_price, 2) }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <div class="doc-totals">
        <p><span>Subtotal</span><span>MVR {{ number_format((float) $order->subtotal, 2) }}</span></p>
        @if ((float) $order->tax_amount > 0.0001)
            <p><span>GST</span><span>MVR {{ number_format((float) $order->tax_amount, 2) }}</span></p>
        @endif
        @if ($discount > 0.0001)
            <p><span>Discount</span><span>− MVR {{ number_format($discount, 2) }}</span></p>
        @endif
        <p class="grand"><span>Total</span><span>MVR {{ number_format((float) $order->total, 2) }}</span></p>
        @if ($refundedTotal > 0.0001)
            <p class="doc-refund"><span>Refunded</span><span>− MVR {{ number_format($refundedTotal, 2) }}</span></p>
            <p class="grand"><span>{{ $isFullyRefunded ? 'Refunded total' : 'Amount you paid' }}</span><span>MVR {{ number_format($netTotal, 2) }}</span></p>
        @endif
    </div>

    @if ($isPaid && $order->payments->count() > 0)
        <div class="doc-payments">
            <h3>Payments</h3>
            @foreach ($order->payments as $p)
                @php
                    $st = $p->status ?? 'paid';
                    $showPay = in_array($st, ['paid', 'completed', 'confirmed'], true);
                @endphp
                @if ($showPay)
                    <div class="doc-pay-row">
                        <span style="text-transform: capitalize">{{ str_replace('_', ' ', $p->method ?? 'Payment') }}</span>
                        <span>MVR {{ number_format((float) $p->amount, 2) }}</span>
                    </div>
                @endif
            @endforeach
        </div>
    @endif

    <div class="doc-actions">
        @if ($isPaid)
            <a class="doc-btn doc-btn-primary" href="{{ url('/receipts/' . $receipt->token . '/pdf') }}">Download PDF</a>
        @endif
    </div>

    @if ($isPaid)
        <div class="doc-feedback">
            <h3>Share feedback</h3>
            <form method="POST" action="{{ url('/receipts/' . $receipt->token . '/feedback') }}">
                @csrf
                <label for="rating">Rating</label>
                <select name="rating" id="rating" required style="margin-bottom: 10px;">
                    <option value="5">5 — Excellent</option>
                    <option value="4">4 — Good</option>
                    <option value="3">3 — Okay</option>
                    <option value="2">2 — Poor</option>
                    <option value="1">1 — Very poor</option>
                </select>
                <label for="comments">Comments (optional)</label>
                <textarea name="comments" id="comments" rows="4" placeholder="Tell us how we did"></textarea>
                <div class="doc-actions" style="margin-top: 12px;">
                    <button class="doc-btn doc-btn-primary" type="submit">Submit feedback</button>
                </div>
            </form>
        </div>
    @endif
</div>
@endsection

@if(request()->boolean('print'))
    @push('scripts')
        <script>
            window.addEventListener('load', function () {
                setTimeout(function () { try { window.print(); } catch (e) {} }, 350);
            });
        </script>
    @endpush
@endif
