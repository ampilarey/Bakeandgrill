@extends('layouts.pdf')

@php
    $displayStatus = strtoupper($invoice->type) . ' · ' . strtoupper($invoice->status);
    $statusClass = match ($invoice->status) {
        'paid' => 'paid',
        'sent', 'draft' => 'sent',
        default => 'pending',
    };
    $billTo = $invoice->recipient_name ?? ($invoice->customer?->name ?? $invoice->supplier?->name ?? '—');
@endphp

@section('title', 'Invoice ' . $invoice->invoice_number)
@section('doc_type', 'Invoice')
@section('doc_number', $invoice->invoice_number)
@section('doc_status', $displayStatus)
@section('doc_status_class', $statusClass)

@section('meta')
<div class="pdf-meta-grid">
    <div class="pdf-meta-col">
        <div class="pdf-meta-label">From</div>
        <div class="pdf-meta-value"><strong>{{ $brandSiteName }}</strong></div>
        <div class="pdf-meta-value">{{ $brandAddress }}</div>
    </div>
    <div class="pdf-meta-col">
        <div class="pdf-meta-label">{{ $invoice->type === 'purchase' ? 'Supplier' : 'Bill to' }}</div>
        <div class="pdf-meta-value"><strong>{{ $billTo }}</strong></div>
        @if ($invoice->recipient_phone)
            <div class="pdf-meta-value">{{ $invoice->recipient_phone }}</div>
        @endif
        @if ($invoice->recipient_email)
            <div class="pdf-meta-value">{{ $invoice->recipient_email }}</div>
        @endif
        @if ($invoice->recipient_address)
            <div class="pdf-meta-value">{{ $invoice->recipient_address }}</div>
        @endif
    </div>
</div>
<div class="pdf-meta-grid" style="margin-top:0;">
    <div class="pdf-meta-col">
        <div class="pdf-meta-value">Issued: {{ $invoice->issue_date?->format('d M Y') }}</div>
        @if ($invoice->due_date)
            <div class="pdf-meta-value">Due: {{ $invoice->due_date->format('d M Y') }}</div>
        @endif
        @if ($invoice->paid_at)
            <div class="pdf-meta-value">Paid: {{ $invoice->paid_at->format('d M Y') }}</div>
        @endif
    </div>
</div>
@endsection

@section('content')
<table class="pdf-table">
    <thead>
        <tr>
            <th style="width:28px;">#</th>
            <th>Description</th>
            <th class="center">Qty</th>
            <th class="right">Unit</th>
            <th class="right">Total</th>
        </tr>
    </thead>
    <tbody>
        @foreach ($invoice->items as $i => $item)
            <tr>
                <td>{{ $i + 1 }}</td>
                <td>
                    {{ $item->description }}
                    @if ($item->unit)
                        <span class="pdf-mods">({{ $item->unit }})</span>
                    @endif
                </td>
                <td class="center">{{ number_format((float) $item->quantity, 2) }}</td>
                <td class="right">MVR {{ number_format((float) $item->unit_price, 2) }}</td>
                <td class="right">MVR {{ number_format((float) $item->total, 2) }}</td>
            </tr>
        @endforeach
    </tbody>
</table>

<div class="pdf-totals">
    <div class="pdf-totals-row"><span>Subtotal</span><span>MVR {{ number_format((float) $invoice->subtotal, 2) }}</span></div>
    @if ($invoice->discount_amount > 0)
        <div class="pdf-totals-row"><span>Discount</span><span>− MVR {{ number_format((float) $invoice->discount_amount, 2) }}</span></div>
    @endif
    @if ($invoice->tax_amount > 0)
        <div class="pdf-totals-row"><span>Tax ({{ number_format($invoice->tax_rate_bp / 100, 1) }}%)</span><span>MVR {{ number_format((float) $invoice->tax_amount, 2) }}</span></div>
    @endif
    <div class="pdf-totals-grand"><span>Total</span><span>MVR {{ number_format((float) $invoice->total, 2) }}</span></div>
</div>

@if ($invoice->notes || $invoice->terms)
    <div class="pdf-notes">
        @if ($invoice->notes)<strong>Notes:</strong> {{ $invoice->notes }}<br>@endif
        @if ($invoice->terms)<strong>Terms:</strong> {{ $invoice->terms }}@endif
    </div>
@endif
@endsection
