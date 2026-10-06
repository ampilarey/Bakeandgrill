@extends('emails.layout')

@php
    $typeLabels = [
        'online_pickup' => 'Pickup',
        'takeaway'      => 'Takeaway',
        'delivery'      => 'Delivery',
        'dine_in'       => 'Dine in',
        'preorder'      => 'Pre-order',
    ];
    $tz = config('app.timezone');
    $money = fn ($v) => 'MVR ' . number_format((float) $v, 2);
    $discount = (float) ($order->discount_amount ?? 0);
    $serviceCharge = (float) ($order->service_charge_amount ?? 0);
    $deliveryFee = (float) ($order->delivery_fee ?? 0);
    $tax = (float) ($order->tax_amount ?? 0);
@endphp

@section('title', 'Order #' . $order->order_number . ' confirmed')
@section('preheader', 'Order #' . $order->order_number . ' is confirmed: ' . $money($order->total) . '. Track it live from this email.')
@section('band', 'Order confirmed')

@section('content')
    <h1 class="eb-h1" style="margin:0 0 8px; font-size:23px; line-height:30px; font-weight:bold; color:#1C1408;">Thank you, {{ $recipientName }}!</h1>
    <p style="margin:0 0 22px; color:#6B5D4F;">We've got your order and the kitchen is on it. You can follow it live at any time.</p>

    @include('emails.partials.button', ['url' => $trackingUrl, 'label' => 'Track your order', 'margin' => '0 auto 24px'])

    @include('emails.partials.rows', ['rows' => array_values(array_filter([
        ['Order number', '#' . $order->order_number],
        ['Type', $typeLabels[$order->type] ?? ucfirst(str_replace('_', ' ', (string) $order->type))],
        $order->created_at ? ['Placed', $order->created_at->timezone($tz)->format('j M Y, g:i a')] : null,
        $order->paid_at ? ['Paid', $order->paid_at->timezone($tz)->format('j M Y, g:i a')] : null,
    ]))])

    <p style="margin:0 0 8px; font-size:12px; line-height:16px; font-weight:bold; letter-spacing:1.2px; text-transform:uppercase; color:#6B5D4F;">Your order</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;">
        @foreach ($order->items as $item)
            <tr>
                <td valign="top" style="padding:10px 0; border-bottom:1px solid #F0EBE5; font-size:14px; line-height:20px; color:#1C1408;">
                    <strong>{{ $item->quantity }} ×</strong> {{ $item->item_name ?? ($item->item?->name ?? 'Item') }}
                    @if ($item->variant_name)<span style="color:#6B5D4F;"> · {{ $item->variant_name }}</span>@endif
                    @if (!empty($item->packaging_option_name))<br><span style="font-size:12px; color:#6B5D4F;">+ {{ $item->packaging_option_name }}</span>@endif
                    @if (!empty($item->notes))<br><span style="font-size:12px; color:#6B5D4F; font-style:italic;">“{{ $item->notes }}”</span>@endif
                </td>
                <td valign="top" align="right" style="padding:10px 0 10px 12px; border-bottom:1px solid #F0EBE5; font-size:14px; line-height:20px; font-weight:bold; color:#1C1408; white-space:nowrap;">{{ $money($item->total_price) }}</td>
            </tr>
        @endforeach
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px; font-size:14px; line-height:20px;">
        @if ($order->subtotal !== null)
            <tr><td style="padding:4px 0; color:#6B5D4F;">Subtotal</td><td align="right" style="padding:4px 0; color:#1C1408;">{{ $money($order->subtotal) }}</td></tr>
        @endif
        @if ($discount > 0)
            <tr><td style="padding:4px 0; color:#6B5D4F;">Discount</td><td align="right" style="padding:4px 0; color:#16a34a;">− {{ $money($discount) }}</td></tr>
        @endif
        @if ($serviceCharge > 0)
            <tr><td style="padding:4px 0; color:#6B5D4F;">{{ $order->service_charge_label ?: 'Service charge' }}</td><td align="right" style="padding:4px 0; color:#1C1408;">{{ $money($serviceCharge) }}</td></tr>
        @endif
        @if ($deliveryFee > 0)
            <tr><td style="padding:4px 0; color:#6B5D4F;">Delivery</td><td align="right" style="padding:4px 0; color:#1C1408;">{{ $money($deliveryFee) }}</td></tr>
        @endif
        @if ($tax > 0)
            <tr><td style="padding:4px 0; color:#6B5D4F;">GST</td><td align="right" style="padding:4px 0; color:#1C1408;">{{ $money($tax) }}</td></tr>
        @endif
        <tr>
            <td style="padding:12px 0 0; border-top:2px solid #1C1408; font-size:17px; font-weight:bold; color:#1C1408;">Total</td>
            <td align="right" style="padding:12px 0 0; border-top:2px solid #1C1408; font-size:17px; font-weight:bold; color:{{ \App\Support\EmailBrand::variables()['primary'] }};">{{ $money($order->total) }}</td>
        </tr>
    </table>

    @if ($order->customer_notes)
        <p style="margin:0; padding:12px 14px; background:#FBF6F0; border-radius:12px; font-size:13px; line-height:20px; color:#6B5D4F;"><strong style="color:#1C1408;">Your note:</strong> {{ $order->customer_notes }}</p>
    @endif
@endsection

@section('footer_note', 'You are receiving this because you placed order #' . $order->order_number . '.')
