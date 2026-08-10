@extends('layouts.document')

@php
    $order = $receipt->order;
    $doc = \App\Support\ReceiptDocumentState::forOrder($order);
    $isPaid = $doc['is_final_paid'];
    $docTitle = $doc['doc_title'];
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
    $deliveryFee = (float) ($order->delivery_fee ?? 0);
    $refunds = $order->refunds ?? collect();
    $refundedTotal = (float) $refunds->sum('amount');
    $isFullyRefunded = $refundedTotal > 0.0001 && in_array($order->status ?? '', ['refunded'], true);
    $netTotal = max(0, (float) $order->total - $refundedTotal);
    $siteName = \App\Models\SiteSetting::get('site_name', 'Bake & Grill');
    $tz = config('app.timezone', 'Indian/Maldives');
    $waLink = \App\Models\SiteSetting::get('business_whatsapp', 'https://wa.me/9609120011');
    if ($waLink === '' || $waLink === null) {
        $phoneDigits = preg_replace('/\D+/', '', (string) \App\Models\SiteSetting::get('business_phone', '9609120011'));
        if ($phoneDigits !== '' && ! str_starts_with($phoneDigits, '960')) {
            $phoneDigits = '960'.$phoneDigits;
        }
        $waLink = $phoneDigits !== '' ? 'https://wa.me/'.$phoneDigits : 'https://wa.me/9609120011';
    }
    $receiptRef = $order->order_number ?? ($receipt->token ?? '');
    $mistakeTotal = $doc['balance_due'] > 0.009
        ? $doc['balance_due']
        : ($isPaid ? $netTotal : (float) $order->total);
    $mistakeMsg = 'Hi Bake & Grill — I think there\'s a mistake on '
        .$doc['mistake_noun'].' for order '.$receiptRef
        .' for MVR '.number_format($mistakeTotal, 2)
        .'. Mistake: ';
@endphp

@section('title', $siteName . ' — ' . $docTitle . ' ' . ($order->order_number ?? ''))

@section('content')
<div class="doc-card">
    @include('partials.document-masthead', [
        'docType' => $docTitle,
        'docNumber' => $order->order_number ?? '',
        'docBadge' => $doc['badge'],
        'docBadgeClass' => $doc['badge_class'],
    ])

    <div class="doc-card-body">
        @if (session('success'))
            <div class="doc-alert doc-alert--success">{{ session('success') }}</div>
        @endif
        @if (session('error'))
            <div class="doc-alert doc-alert--error">{{ session('error') }}</div>
        @endif

        @if ($doc['banner_text'])
            <div class="doc-banner doc-banner--{{ $doc['banner_kind'] ?? 'ok' }}">
                {{ $doc['banner_text'] }}
            </div>
        @endif

        <div class="doc-meta">
            <div class="doc-meta-row"><span>Order type</span><span>{{ $typeLabel }}</span></div>
            <div class="doc-meta-row"><span>Status</span><span style="text-transform: capitalize">{{ $statusLabel }}</span></div>
            <div class="doc-meta-row"><span>Placed</span><span>{{ optional($order->created_at)->timezone($tz)->format('D, j M Y g:i A') }}</span></div>
            @if ($order->fulfil_date)
                <div class="doc-meta-row"><span>Collect on</span><span>{{ $order->fulfil_date->timezone($tz)->format('D, j M Y') }}</span></div>
            @endif
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
                            @if (!empty($item->packaging_option_name))
                                <div class="doc-mods">+ {{ $item->packaging_option_name }}</div>
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
        </div>

        <div class="doc-totals">
            <p><span>Subtotal</span><span>MVR {{ number_format((float) $order->subtotal, 2) }}</span></p>
            @if ($deliveryFee > 0.0001)
                <p><span>Delivery fee</span><span>MVR {{ number_format($deliveryFee, 2) }}</span></p>
            @endif
            @if ($discount > 0.0001)
                <p><span>Discount</span><span>− MVR {{ number_format($discount, 2) }}</span></p>
            @endif
            @include('partials.order-service-charge-line', ['order' => $order])
            @if ((float) $order->tax_amount > 0.0001)
                <p><span>GST</span><span>MVR {{ number_format((float) $order->tax_amount, 2) }}</span></p>
            @endif
            <p class="grand"><span>Total</span><span>MVR {{ number_format((float) $order->total, 2) }}</span></p>
            @if ($doc['balance_due'] > 0.009)
                <p class="doc-refund"><span>Balance due</span><span>MVR {{ number_format($doc['balance_due'], 2) }}</span></p>
            @endif
            @if ($refundedTotal > 0.0001)
                <p class="doc-refund"><span>Refunded</span><span>− MVR {{ number_format($refundedTotal, 2) }}</span></p>
                <p class="grand"><span>{{ $isFullyRefunded ? 'Refunded total' : 'Amount you paid' }}</span><span>MVR {{ number_format($netTotal, 2) }}</span></p>
            @endif
        </div>

        @if ($doc['show_payments'] && $order->payments->count() > 0)
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
            @if ($doc['show_pdf'])
                <a class="doc-btn doc-btn-primary" href="{{ url('/receipts/' . $receipt->token . '/pdf') }}">Download PDF</a>
            @endif
            <button type="button" class="doc-btn doc-btn-print">Print</button>
        </div>

        @php
            $complaintForm = \App\Support\ComplaintFormPresenter::forReceipt($receipt);
        @endphp
        @include('partials.document-mistake-cta', [
            'waHref' => $waLink.'?text='.rawurlencode($mistakeMsg),
            'ctaLabel' => 'Something wrong with this receipt?',
            'complaintEndpoint' => $complaintForm['endpoint'],
            'complaintCategories' => $complaintForm['categories'],
            'complaintItems' => $complaintForm['items'],
            'complaintWindowClosed' => $complaintForm['window_closed'],
        ])

        @if ($doc['show_feedback'])
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

        @include('partials.document-print-footer')
    </div>
</div>
@endsection

@push('scripts')
    <script nonce="{{ csp_nonce() }}">
        document.querySelectorAll('.doc-btn-print').forEach(function (btn) {
            btn.addEventListener('click', function () { window.print(); });
        });
    </script>
@endpush

@if(request()->boolean('print'))
    @push('scripts')
        <script nonce="{{ csp_nonce() }}">
            window.addEventListener('load', function () {
                setTimeout(function () { try { window.print(); } catch (e) {} }, 350);
            });
        </script>
    @endpush
@endif
