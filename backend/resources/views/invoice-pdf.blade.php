@extends('layouts.pdf')

@php
    $onCredit = $invoice->isOnCreditAccount();
    $displayStatus = $invoice->displayStatusLabel();
    $balanceDueMvr = $invoice->balanceDueLaar() / 100;
    $statusClass = match ($invoice->status) {
        'paid' => 'paid',
        'sent', 'draft' => 'sent',
        default => 'pending',
    };
@endphp

@section('title', 'Invoice ' . $invoice->invoice_number)
@section('doc_type', 'Invoice')
@section('doc_number', $invoice->invoice_number)
@section('doc_status', $displayStatus)
@section('doc_status_class', $statusClass)

@section('meta')
<div class="pdf-meta-grid">
    <div class="pdf-meta-col">
        @if ($invoice->customer || $invoice->recipient_name)
            <div class="pdf-meta-label">Bill to</div>
            <div class="pdf-meta-value"><strong>{{ $invoice->customer->name ?? $invoice->recipient_name }}</strong></div>
            @if ($invoice->customer->phone ?? $invoice->recipient_phone)
                <div class="pdf-meta-value">{{ $invoice->customer->phone ?? $invoice->recipient_phone }}</div>
            @endif
        @endif
    </div>
    <div class="pdf-meta-col">
        <div class="pdf-meta-label">Dates</div>
        <div class="pdf-meta-value">Issued: {{ optional($invoice->issue_date)->format('d M Y') ?? optional($invoice->created_at)->format('d M Y') }}</div>
        @if ($invoice->due_date)
            <div class="pdf-meta-value">Due: {{ $invoice->due_date->format('d M Y') }}</div>
        @endif
        @if ($invoice->paid_at)
            <div class="pdf-meta-value">Paid: {{ $invoice->paid_at->format('d M Y') }}</div>
        @elseif ($onCredit && $balanceDueMvr > 0)
            <div class="pdf-meta-value">Balance due: MVR {{ number_format($balanceDueMvr, 2) }}</div>
        @endif
    </div>
</div>
@endsection

@section('content')
<table class="pdf-table">
    <thead>
        <tr>
            <th>Description</th>
            <th class="center">Qty</th>
            <th class="right">Unit</th>
            <th class="right">Total</th>
        </tr>
    </thead>
    <tbody>
        @forelse ($invoice->items as $item)
            <tr>
                <td>{{ $item->description ?? $item->name }}</td>
                <td class="center">{{ $item->quantity ?? 1 }}</td>
                <td class="right">MVR {{ number_format((float) ($item->unit_price ?? $item->amount), 2) }}</td>
                <td class="right">MVR {{ number_format((float) ($item->total ?? ($item->unit_price * ($item->quantity ?? 1))), 2) }}</td>
            </tr>
        @empty
            @if ($invoice->order)
                @foreach ($invoice->order->items as $orderItem)
                    <tr>
                        <td>
                            {{ $orderItem->item_name }}{{ $orderItem->variant_name ? ' — '.$orderItem->variant_name : '' }}{{ !empty($orderItem->packaging_option_name) ? ' — '.$orderItem->packaging_option_name : '' }}
                        </td>
                        <td class="center">{{ $orderItem->quantity }}</td>
                        <td class="right">MVR {{ number_format((float) $orderItem->unit_price, 2) }}</td>
                        <td class="right">MVR {{ number_format((float) $orderItem->total_price, 2) }}</td>
                    </tr>
                @endforeach
            @endif
        @endforelse
    </tbody>
</table>

<div class="pdf-totals">
    <div class="pdf-totals-row"><span>Subtotal</span><span>MVR {{ number_format((float) $invoice->subtotal, 2) }}</span></div>
    @if ((float) ($invoice->tax_amount ?? 0) > 0)
        <div class="pdf-totals-row"><span>Tax</span><span>MVR {{ number_format((float) $invoice->tax_amount, 2) }}</span></div>
    @endif
    @if ((float) ($invoice->discount_amount ?? 0) > 0)
        <div class="pdf-totals-row"><span>Discount</span><span>− MVR {{ number_format((float) $invoice->discount_amount, 2) }}</span></div>
    @endif
    <div class="pdf-totals-grand"><span>Total</span><span>MVR {{ number_format((float) $invoice->total, 2) }}</span></div>
    @if ($balanceDueMvr > 0 && $invoice->status !== 'paid')
        <div class="pdf-totals-grand" style="color:#92400E;"><span>Balance due</span><span>MVR {{ number_format($balanceDueMvr, 2) }}</span></div>
    @endif
</div>

@if ($invoice->notes)
    <div class="pdf-notes"><strong>Notes:</strong> {{ $invoice->notes }}</div>
@endif
@endsection
