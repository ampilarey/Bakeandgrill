@extends('layouts.document')

@php
    $siteName = \App\Models\SiteSetting::get('site_name', 'Bake & Grill');
    $onCredit = $invoice->isOnCreditAccount();
    $balanceDueMvr = $invoice->balanceDueLaar() / 100;
    $displayStatus = $invoice->displayStatusLabel();
    $badgeClass = match (true) {
        $invoice->status === 'paid' => 'doc-badge--paid',
        $onCredit && in_array($invoice->status, ['sent', 'overdue'], true) => 'doc-badge--sent',
        $invoice->status === 'draft' => 'doc-badge--draft',
        $invoice->status === 'sent' => 'doc-badge--sent',
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
    // Open / unpaid bills only — paid tax invoices don't need a mistake CTA.
    $showMistakeCta = ! in_array($invoice->status, ['paid', 'void', 'cancelled'], true)
        && $balanceDueMvr > 0;
    $waLink = \App\Models\SiteSetting::get('business_whatsapp', 'https://wa.me/9609120011');
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
                            <td>{{ $item->item_name }}{{ $item->variant_name ? ' — '.$item->variant_name : '' }}</td>
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
            @if ($balanceDueMvr > 0 && $invoice->status !== 'paid')
                <p class="grand" style="color:#92400E;">
                    <span>Balance due</span><span>MVR {{ number_format($balanceDueMvr, 2) }}</span>
                </p>
            @endif
        </div>

        @if ($invoice->notes)
            <div style="margin-top:1.25rem;">
                <p class="doc-eyebrow">Notes</p>
                <p>{{ $invoice->notes }}</p>
            </div>
        @endif

        <div class="doc-actions">
            <a class="doc-btn doc-btn-primary" href="{{ url('/invoices/' . $invoice->token . '/pdf') }}">Download PDF</a>
            <button type="button" class="doc-btn doc-btn-print">Print</button>
        </div>

        @if ($showMistakeCta)
            <div class="doc-actions doc-mistake-cta" style="flex-direction: column; align-items: stretch; margin-top: 0.75rem;">
                <a class="doc-btn" href="{{ $waLink }}?text={{ rawurlencode($mistakeMsg) }}" target="_blank" rel="noopener">
                    Something wrong with this bill?
                </a>
                <p class="doc-subtitle" style="margin: 0.35rem 0 0; text-align: center;">
                    Message us on WhatsApp and we’ll fix it.
                </p>
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
