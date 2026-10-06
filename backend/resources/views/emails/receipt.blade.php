@extends('emails.layout')

@php
    $money = fn ($v) => 'MVR ' . number_format((float) $v, 2);
    $receiptUrl = url('/receipts/' . $receipt->token);
    $when = $order?->paid_at ?? $order?->created_at ?? $receipt->created_at;
@endphp

@section('title', 'Receipt ' . ($order->order_number ?? ''))
@section('preheader', 'Your receipt for order ' . ($order->order_number ?? '') . ': ' . $money($order->total ?? 0) . '. Open it, save it or print it.')
@section('band', 'Receipt')

@section('content')
    <h1 class="eb-h1" style="margin:0 0 8px; font-size:23px; line-height:30px; font-weight:bold; color:#1C1408;">Thanks for visiting!</h1>
    <p style="margin:0 0 22px; color:#6B5D4F;">Your receipt is ready. Open it to see every item, save it as a PDF or print it.</p>

    @include('emails.partials.rows', ['rows' => array_values(array_filter([
        ['Order', '#' . ($order->order_number ?? '')],
        $when ? ['Date', $when->timezone(config('app.timezone'))->format('j M Y, g:i a')] : null,
        ['Total', $money($order->total ?? 0), true],
    ]))])

    @include('emails.partials.button', ['url' => $receiptUrl, 'label' => 'Open your receipt', 'margin' => '0 auto 8px'])
@endsection

@section('footer_note', 'You are receiving this because a receipt was sent to this address.')
