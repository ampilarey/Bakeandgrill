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
    // The page's own link as a QR: one scan reaches this receipt, its
    // feedback and complaint form, and the till pulls the order back up.
    $receiptUrl = url('/receipts/' . $receipt->token);
    $receiptQr = \App\Support\QrSvg::dataUri($receiptUrl, 140);
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

        <div class="doc-qr" data-testid="receipt-qr" style="display:flex;align-items:center;gap:14px;margin:18px 0 6px;padding:12px;border:1px solid var(--border, #E8E0D8);border-radius:12px;background:#fff;">
            <img src="{{ $receiptQr }}" alt="QR code for this receipt" width="96" height="96" style="width:96px;height:96px;flex-shrink:0;">
            <div style="font-size:13px;line-height:1.5;color:#6B5D4F;">
                <strong style="display:block;color:#1C1408;">Scan to open this receipt</strong>
                Show it at the counter to bring the order up, or scan it later for feedback and a complaint form.
            </div>
        </div>

        <div class="doc-actions">
            @if ($doc['show_pdf'])
                <a class="doc-btn doc-btn-primary" href="{{ url('/receipts/' . $receipt->token . '/pdf') }}">Download PDF</a>
            @endif
            <button type="button" class="doc-btn doc-btn-print">Print</button>
        </div>

        @php
            $complaintForm = \App\Support\ComplaintFormPresenter::forReceipt($receipt);
            $existingFeedback = $existingFeedback ?? $receipt->latestFeedback;
        @endphp
        @include('partials.document-mistake-cta', [
            'waHref' => $waLink.'?text='.rawurlencode($mistakeMsg),
            'ctaLabel' => 'Something wrong with this receipt?',
            'complaintEndpoint' => $complaintForm['endpoint'],
            'complaintCategories' => $complaintForm['categories'],
            'complaintItems' => $complaintForm['items'],
            'complaintWindowClosed' => $complaintForm['window_closed'],
            'existingComplaints' => $complaintForm['existing_complaints'],
            'atOpenCap' => $complaintForm['at_open_cap'],
            'canSubmitAnother' => $complaintForm['can_submit_another'],
        ])

        @if ($doc['show_feedback'])
            <div class="doc-feedback" data-receipt-rating-root data-order-id="{{ $receipt->order_id }}" data-existing-rating="{{ $existingFeedback?->rating ?? '' }}">
                <h3>Share feedback</h3>
                @if ($existingFeedback)
                    <div class="doc-feedback-current" data-rating-current>
                        <p class="doc-feedback-label">Your rating</p>
                        <div class="doc-feedback-current__stars" aria-label="{{ (int) $existingFeedback->rating }} out of 5">
                            @for ($star = 1; $star <= 5; $star++)
                                <span>{{ $star <= (int) $existingFeedback->rating ? '★' : '☆' }}</span>
                            @endfor
                        </div>
                        <button type="button" class="doc-feedback-change" data-rating-change>Change rating</button>
                    </div>
                @endif
                <form method="POST" action="{{ url('/receipts/' . $receipt->token . '/feedback') }}" data-rating-form @if ($existingFeedback) hidden @endif>
                    @csrf
                    <p class="doc-feedback-label">Tap a star</p>
                    <div class="doc-star-row" role="radiogroup" aria-label="Rating">
                        @for ($star = 1; $star <= 5; $star++)
                            <button
                                type="button"
                                class="doc-star{{ $existingFeedback && (int) $existingFeedback->rating >= $star ? ' is-on' : '' }}"
                                data-star="{{ $star }}"
                                aria-label="{{ $star }} star{{ $star === 1 ? '' : 's' }}"
                                aria-checked="{{ $existingFeedback && (int) $existingFeedback->rating === $star ? 'true' : 'false' }}"
                                role="radio"
                            >★</button>
                        @endfor
                    </div>
                    <input type="hidden" name="rating" id="rating" value="{{ $existingFeedback?->rating ?? '' }}" required data-rating-input>
                    <label for="comments">Comments (optional)</label>
                    <textarea name="comments" id="comments" rows="3" placeholder="Tell us how we did">{{ $existingFeedback?->comments }}</textarea>
                    <div class="doc-actions" style="margin-top: 12px;">
                        <button class="doc-btn doc-btn-primary" type="submit" data-rating-submit @if (! $existingFeedback) disabled @endif>
                            {{ $existingFeedback ? 'Update rating' : 'Submit feedback' }}
                        </button>
                    </div>
                </form>
                <div class="doc-review-invite" data-review-invite @if (! $existingFeedback || (int) $existingFeedback->rating < 4) hidden @endif>
                    <p>Glad you enjoyed it. Want to leave a <strong>public</strong> review? You’ll need to sign in — it’s optional.</p>
                    <a class="doc-btn doc-btn-primary" href="{{ url('/order/account') }}">Leave a public review</a>
                </div>
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

        (function () {
            var root = document.querySelector('[data-receipt-rating-root]');
            if (!root) return;
            var input = root.querySelector('[data-rating-input]');
            var submit = root.querySelector('[data-rating-submit]');
            var invite = root.querySelector('[data-review-invite]');
            var form = root.querySelector('[data-rating-form]');
            var current = root.querySelector('[data-rating-current]');
            var changeBtn = root.querySelector('[data-rating-change]');
            var stars = root.querySelectorAll('[data-star]');

            function paint(n) {
                stars.forEach(function (btn) {
                    var v = parseInt(btn.getAttribute('data-star'), 10);
                    var on = v <= n;
                    btn.classList.toggle('is-on', on);
                    btn.setAttribute('aria-checked', v === n ? 'true' : 'false');
                });
            }

            if (changeBtn && form && current) {
                changeBtn.addEventListener('click', function () {
                    current.hidden = true;
                    form.hidden = false;
                    var existing = parseInt(root.getAttribute('data-existing-rating') || '0', 10);
                    if (existing) paint(existing);
                });
            }

            stars.forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var n = parseInt(btn.getAttribute('data-star'), 10);
                    if (!n) return;
                    input.value = String(n);
                    paint(n);
                    if (submit) submit.disabled = false;

                    if (n <= 2) {
                        if (invite) invite.hidden = true;
                        var cta = document.querySelector('[data-complaint-root]');
                        if (cta && typeof cta.openComplaint === 'function') {
                            cta.openComplaint('something_else');
                        }
                    } else if (n >= 4) {
                        if (invite) invite.hidden = false;
                    } else if (invite) {
                        invite.hidden = true;
                    }
                });
            });
        })();
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
