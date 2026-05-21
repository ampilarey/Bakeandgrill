@extends('layouts.document')

@php
    $siteName = \App\Models\SiteSetting::get('site_name', 'Bake & Grill');
    $badgeClass = match ($invoice->status) {
        'paid'  => 'doc-badge--paid',
        'draft' => 'doc-badge--draft',
        'sent'  => 'doc-badge--sent',
        default => 'doc-badge--unpaid',
    };
@endphp

@section('title', 'Invoice ' . $invoice->invoice_number . ' — ' . $siteName)

@section('content')
<div class="doc-card">
    <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem; margin-bottom:1rem;">
        <div>
            <p class="doc-eyebrow">Invoice</p>
            <h1 class="doc-title">{{ $invoice->invoice_number }}</h1>
            <p class="doc-subtitle" style="margin-bottom:0;">{{ $siteName }}</p>
        </div>
        <div style="text-align:right;">
            <span class="doc-badge {{ $badgeClass }}">{{ strtoupper($invoice->status) }}</span>
        </div>
    </div>

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
            @endif
        </div>
    </div>

    <table class="doc-table">
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

    <div class="doc-totals">
        <p><span>Subtotal</span><span>MVR {{ number_format((float) $invoice->subtotal, 2) }}</span></p>
        @if ((float) ($invoice->tax_amount ?? 0) > 0)
            <p><span>Tax</span><span>MVR {{ number_format((float) $invoice->tax_amount, 2) }}</span></p>
        @endif
        @if ((float) ($invoice->discount_amount ?? 0) > 0)
            <p><span>Discount</span><span>− MVR {{ number_format((float) $invoice->discount_amount, 2) }}</span></p>
        @endif
        <p class="grand"><span>Total</span><span>MVR {{ number_format((float) $invoice->total, 2) }}</span></p>
    </div>

    @if ($invoice->notes)
        <div style="margin-top:1.25rem;">
            <p class="doc-eyebrow">Notes</p>
            <p>{{ $invoice->notes }}</p>
        </div>
    @endif

    <div class="doc-actions">
        <a class="doc-btn doc-btn-primary" href="{{ url('/invoices/' . $invoice->token . '/pdf') }}">Download PDF</a>
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
