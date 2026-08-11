@extends('layouts.document')

@php
    $siteName = \App\Models\SiteSetting::get('site_name', 'Bake & Grill');
    $onCredit = $invoice->isOnCreditAccount();
    $page = $page ?? \App\Support\InvoicePagePresenter::present($invoice);
    $balanceDueMvr = (float) $page['display_balance_mvr'];
    $displayStatus = $invoice->displayStatusLabel();
    $badgeClass = match (true) {
        $invoice->status === 'paid' => 'doc-badge--paid',
        $onCredit && in_array($invoice->status, ['sent', 'overdue'], true) => 'doc-badge--sent',
        $invoice->status === 'draft' => 'doc-badge--draft',
        $invoice->status === 'sent' => 'doc-badge--sent',
        ($page['overdue_days'] ?? null) !== null => 'doc-badge--unpaid',
        default => 'doc-badge--unpaid',
    };
    // Open (unpaid) POS bills: always show the live order lines/total.
    // The invoice row is a snapshot that can lag after "Save changes",
    // and customers hit the same /invoices/{token} link from SMS.
    $orderOpen = $invoice->order
        && !in_array($invoice->order->payment_status, ['paid'], true)
        && !in_array($invoice->order->status, ['paid', 'completed', 'cancelled', 'refunded', 'partially_refunded'], true);
    $useOrderSnapshot = $invoice->order
        && !$invoice->is_tax_invoice
        && (int) ($invoice->amount_paid_laar ?? 0) === 0
        && !in_array($invoice->status, ['paid', 'void', 'cancelled'], true)
        && (
            $orderOpen
            || ((float) $invoice->total <= 0 && (float) $invoice->order->total > 0)
            || $invoice->items->isEmpty()
        );
    $displaySubtotal = $useOrderSnapshot ? (float) $invoice->order->subtotal : (float) $invoice->subtotal;
    $displayTax = $useOrderSnapshot ? (float) ($invoice->order->tax_amount ?? 0) : (float) ($invoice->tax_amount ?? 0);
    $displayDiscount = $useOrderSnapshot ? (float) ($invoice->order->discount_amount ?? 0) : (float) ($invoice->discount_amount ?? 0);
    $displayTotal = $useOrderSnapshot ? (float) $invoice->order->total : (float) $invoice->total;
    $displayItems = $useOrderSnapshot ? $invoice->order->items : $invoice->items;
    $itemsAreOrderLines = $useOrderSnapshot;
    $lineSum = (float) $displayItems->sum(function ($item) use ($itemsAreOrderLines) {
        if ($itemsAreOrderLines) {
            $line = (float) ($item->total_price ?? 0);
            if ($line <= 0) {
                $line = (float) ($item->unit_price ?? 0) * (float) ($item->quantity ?? 0);
            }
            return $line;
        }
        return (float) ($item->total ?? 0);
    });
    if ($displayTotal <= 0 && $lineSum > 0) {
        $displayTotal = $lineSum;
        if ($displaySubtotal <= 0) {
            $displaySubtotal = $lineSum;
        }
    }
    // Unpaid / open bills only — paid customers use the receipt page CTA instead.
    $showMistakeCta = ! in_array($invoice->status, ['paid', 'void', 'cancelled'], true);
    $waLink = \App\Models\SiteSetting::get('business_whatsapp', 'https://wa.me/9609120011');
    if ($waLink === '' || $waLink === null) {
        $phoneDigits = preg_replace('/\D+/', '', (string) \App\Models\SiteSetting::get('business_phone', '9609120011'));
        if ($phoneDigits !== '' && ! str_starts_with($phoneDigits, '960')) {
            $phoneDigits = '960'.$phoneDigits;
        }
        $waLink = $phoneDigits !== '' ? 'https://wa.me/'.$phoneDigits : 'https://wa.me/9609120011';
    }
    $orderNumber = $invoice->order?->order_number;
    $mistakeMsg = 'Hi Bake & Grill — I think there\'s a mistake on bill '.$invoice->invoice_number
        .($orderNumber ? ' (order '.$orderNumber.')' : '')
        .' for MVR '.number_format($displayTotal, 2)
        .'. Mistake: ';
@endphp

@section('title', 'Invoice ' . $invoice->invoice_number . ' — ' . $siteName)

@section('content')
<div class="doc-card">
    @include('partials.document-masthead', [
        'docType' => 'Invoice',
        'docNumber' => $invoice->invoice_number,
        'docBadge' => $displayStatus,
        'docBadgeClass' => $badgeClass,
    ])

    <div class="doc-card-body">
        <div class="doc-meta-grid">
            @if ($invoice->customer || $invoice->recipient_name)
                <div>
                    <p class="doc-eyebrow">Bill to</p>
                    <p style="font-weight:700; margin:0;">{{ $invoice->customer->name ?? $invoice->recipient_name }}</p>
                    @if ($invoice->customer->phone ?? $invoice->recipient_phone)
                        <p class="doc-subtitle" style="margin:0;">{{ $invoice->customer->phone ?? $invoice->recipient_phone }}</p>
                    @endif
                </div>
            @endif
            <div>
                <p class="doc-eyebrow">Dates</p>
                <p style="margin:0;">Issued: {{ optional($invoice->issue_date)->format('d M Y') ?? optional($invoice->created_at)->format('d M Y') }}</p>
                @if ($invoice->due_date)
                    <p style="margin:0.25rem 0 0; color:var(--muted);">Due: {{ $invoice->due_date->format('d M Y') }}</p>
                @endif
                @if (($page['overdue_days'] ?? null) !== null)
                    <p style="margin:0.25rem 0 0; color:var(--danger-text, #b91c1c); font-weight:700;" data-overdue-days="{{ $page['overdue_days'] }}">
                        Overdue by {{ $page['overdue_days'] }} {{ $page['overdue_days'] === 1 ? 'day' : 'days' }}
                    </p>
                @endif
                @if ($invoice->paid_at)
                    <p style="margin:0.25rem 0 0; color:var(--success-text); font-weight:600;">Paid: {{ $invoice->paid_at->format('d M Y') }}</p>
                @elseif ($onCredit && $balanceDueMvr > 0)
                    <p style="margin:0.25rem 0 0; color:#92400E; font-weight:600;">Balance due: MVR {{ number_format($balanceDueMvr, 2) }}</p>
                @endif
            </div>
        </div>

        <div class="doc-table-scroll">
        <table class="doc-table doc-table--wide">
            <thead>
                <tr>
                    <th>Description</th>
                    <th class="qty">Qty</th>
                    <th class="amount">Unit</th>
                    <th class="amount">Total</th>
                </tr>
            </thead>
            <tbody>
                @forelse ($displayItems as $item)
                    <tr>
                        @if ($itemsAreOrderLines)
                            <td>{{ $item->item_name }}{{ $item->variant_name ? ' — '.$item->variant_name : '' }}{{ !empty($item->packaging_option_name) ? ' — '.$item->packaging_option_name : '' }}</td>
                            <td class="qty">{{ $item->quantity }}</td>
                            <td class="amount">MVR {{ number_format((float) $item->unit_price, 2) }}</td>
                            <td class="amount">MVR {{ number_format((float) $item->total_price, 2) }}</td>
                        @else
                            <td>{{ $item->description ?? $item->name }}</td>
                            <td class="qty">{{ $item->quantity ?? 1 }}</td>
                            <td class="amount">MVR {{ number_format((float) ($item->unit_price ?? $item->amount), 2) }}</td>
                            <td class="amount">MVR {{ number_format((float) ($item->total ?? ($item->unit_price * ($item->quantity ?? 1))), 2) }}</td>
                        @endif
                    </tr>
                @empty
                @endforelse
            </tbody>
        </table>
        </div>

        <div class="doc-totals">
            <p><span>Subtotal</span><span>MVR {{ number_format($displaySubtotal, 2) }}</span></p>
            @if ($displayTax > 0)
                <p><span>Tax</span><span>MVR {{ number_format($displayTax, 2) }}</span></p>
            @endif
            @if ($displayDiscount > 0)
                <p><span>Discount</span><span>− MVR {{ number_format($displayDiscount, 2) }}</span></p>
            @endif
            <p class="grand"><span>Total</span><span>MVR {{ number_format($displayTotal, 2) }}</span></p>
            @foreach ($page['credit_notes'] as $cn)
                <p data-credit-note>
                    <span>Credit note {{ $cn['number'] }}</span>
                    <span>− MVR {{ number_format($cn['total_mvr'], 2) }}</span>
                </p>
            @endforeach
            @if ($balanceDueMvr > 0 && $invoice->status !== 'paid')
                <p class="grand" style="color:#92400E;" data-balance-due>
                    <span>Balance due</span><span>MVR {{ number_format($balanceDueMvr, 2) }}</span>
                </p>
            @elseif (count($page['credit_notes']) > 0 && $balanceDueMvr <= 0 && $invoice->status !== 'paid')
                <p class="grand" style="color:var(--success-text);" data-balance-due>
                    <span>Balance due</span><span>MVR 0.00</span>
                </p>
            @endif
        </div>

        @if (count($page['deliveries']) > 0)
            <div style="margin-top:1.25rem;" data-trade-deliveries>
                <p class="doc-eyebrow">Deliveries on this invoice</p>
                @foreach ($page['deliveries'] as $delivery)
                    <div style="margin:0.65rem 0 0.35rem;">
                        <p style="margin:0; font-weight:700;">{{ $delivery['reference'] }} · {{ $delivery['date'] }}</p>
                        <ul style="margin:0.35rem 0 0; padding-left:1.1rem;">
                            @foreach ($delivery['lines'] as $line)
                                <li>
                                    {{ $line['label'] }}
                                    — {{ $line['qty'] }}
                                    @if ($line['kind'] === 'missing') (not returned) @endif
                                    · MVR {{ number_format($line['amount_mvr'], 2) }}
                                </li>
                            @endforeach
                        </ul>
                    </div>
                @endforeach
            </div>
        @endif

        @if (count($page['payment_history']) > 0)
            <div style="margin-top:1.25rem;" data-payment-history>
                <p class="doc-eyebrow">Payment history</p>
                <div class="doc-table-scroll">
                    <table class="doc-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Method</th>
                                <th>Status</th>
                                <th class="amount">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            @foreach ($page['payment_history'] as $pay)
                                <tr>
                                    <td>{{ $pay['date'] }}</td>
                                    <td>{{ $pay['method'] }}</td>
                                    <td>{{ $pay['status'] }}</td>
                                    <td class="amount">MVR {{ number_format($pay['amount_mvr'], 2) }}</td>
                                </tr>
                            @endforeach
                        </tbody>
                    </table>
                </div>
            </div>
        @endif

        @if ($invoice->notes)
            <div style="margin-top:1.25rem;">
                <p class="doc-eyebrow">Notes</p>
                <p>{{ $invoice->notes }}</p>
            </div>
        @endif

        <div class="doc-actions">
            @if (!empty($page['pay_cta']))
                <a
                    class="doc-btn doc-btn-primary"
                    href="{{ $page['pay_cta']['href'] }}"
                    data-pay-cta="{{ $page['pay_cta']['kind'] }}"
                >{{ $page['pay_cta']['label'] }}</a>
            @endif
            <a class="doc-btn {{ empty($page['pay_cta']) ? 'doc-btn-primary' : '' }}" href="{{ url('/invoices/' . $invoice->token . '/pdf') }}">Download PDF</a>
            <button type="button" class="doc-btn doc-btn-print">Print</button>
        </div>

        @if ($showMistakeCta)
            @php
                $complaintForm = \App\Support\ComplaintFormPresenter::forInvoice($invoice);
            @endphp
            @include('partials.document-mistake-cta', [
                'waHref' => $waLink.'?text='.rawurlencode($mistakeMsg),
                'ctaLabel' => 'Something wrong with this bill?',
                'complaintEndpoint' => $complaintForm['endpoint'],
                'complaintCategories' => $complaintForm['categories'],
                'complaintItems' => $complaintForm['items'],
                'complaintWindowClosed' => $complaintForm['window_closed'],
            ])
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
