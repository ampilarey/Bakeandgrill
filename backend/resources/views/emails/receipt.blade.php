@extends('emails.layout')

@php
    $money = fn ($v) => 'MVR ' . number_format((float) $v, 2);
    $receiptUrl = url('/receipts/' . $receipt->token);
    $when = $order?->paid_at ?? $order?->created_at ?? $receipt->created_at;
@endphp

@section('title', __('Receipt :number', ['number' => $order->order_number ?? '']))
@section('preheader', __('Your receipt for order :number: :total. Open it, save it or print it.', ['number' => $order->order_number ?? '', 'total' => $money($order->total ?? 0)]))
@section('band', __('Receipt'))

@section('content')
    <h1 class="eb-h1" style="margin:0 0 8px; font-size:23px; line-height:30px; font-weight:bold; color:#1C1408;">{{ __('Thanks for visiting!') }}</h1>
    <p style="margin:0 0 22px; color:#6B5D4F;">{{ __('Your receipt is ready. Open it to see every item, save it as a PDF or print it.') }}</p>

    @include('emails.partials.rows', ['rows' => array_values(array_filter([
        [__('Order'), '#' . ($order->order_number ?? '')],
        $when ? [__('Date'), $when->timezone(config('app.timezone'))->format('j M Y, g:i a')] : null,
        [__('Total'), $money($order->total ?? 0), true],
    ]))])

    @include('emails.partials.button', ['url' => $receiptUrl, 'label' => __('Open your receipt'), 'margin' => '0 auto 10px'])
    @include('emails.partials.button', [
        'url' => \App\Support\ComplaintBoxLink::url('email', (string) ($order->order_number ?? '')),
        'label' => __('Report a problem with this order'),
        'variant' => 'outline',
        'margin' => '0 auto 4px',
    ])
@endsection

@section('complaint_order', (string) ($order->order_number ?? ''))

@section('footer_note', __('You are receiving this because a receipt was sent to this address.'))
