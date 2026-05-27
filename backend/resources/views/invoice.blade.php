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
                @forelse ($invoice->items as $item)
                    <tr>
                        <td>{{ $item->description ?? $item->name }}</td>
                        <td class="qty">{{ $item->quantity ?? 1 }}</td>
                        <td class="amount">MVR {{ number_format((float) ($item->unit_price ?? $item->amount), 2) }}</td>
                        <td class="amount">MVR {{ number_format((float) ($item->total ?? ($item->unit_price * ($item->quantity ?? 1))), 2) }}</td>
                    </tr>
                @empty
                    @if ($invoice->order)
                        @foreach ($invoice->order->items as $orderItem)
                            <tr>
                                <td>{{ $orderItem->item_name }}</td>
                                <td class="qty">{{ $orderItem->quantity }}</td>
                                <td class="amount">MVR {{ number_format((float) $orderItem->unit_price, 2) }}</td>
                                <td class="amount">MVR {{ number_format((float) $orderItem->total_price, 2) }}</td>
                            </tr>
                        @endforeach
                    @endif
                @endforelse
            </tbody>
        </table>
        </div>

        <div class="doc-totals">
            <p><span>Subtotal</span><span>MVR {{ number_format((float) $invoice->subtotal, 2) }}</span></p>
            @if ((float) ($invoice->tax_amount ?? 0) > 0)
                <p><span>Tax</span><span>MVR {{ number_format((float) $invoice->tax_amount, 2) }}</span></p>
            @endif
            @if ((float) ($invoice->discount_amount ?? 0) > 0)
                <p><span>Discount</span><span>− MVR {{ number_format((float) $invoice->discount_amount, 2) }}</span></p>
            @endif
            <p class="grand"><span>Total</span><span>MVR {{ number_format((float) $invoice->total, 2) }}</span></p>
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
            <button type="button" class="doc-btn" onclick="window.print()">Print</button>
        </div>

        @include('partials.document-print-footer')
    </div>
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
