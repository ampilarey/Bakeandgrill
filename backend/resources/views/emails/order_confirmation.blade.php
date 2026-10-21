@extends('emails.layout')

@php
    $typeLabels = [
        'online_pickup' => __('Pickup'),
        'takeaway'      => __('Takeaway'),
        'delivery'      => __('Delivery'),
        'dine_in'       => __('Dine in'),
        'preorder'      => __('Pre-order'),
    ];
    $tz = config('app.timezone');
    $money = fn ($v) => 'MVR ' . number_format((float) $v, 2);
    $discount = (float) ($order->discount_amount ?? 0);
    $serviceCharge = (float) ($order->service_charge_amount ?? 0);
    $deliveryFee = (float) ($order->delivery_fee ?? 0);
    $tax = (float) ($order->tax_amount ?? 0);
@endphp

@section('title', __('Order #:number confirmed', ['number' => $order->order_number]))
@section('preheader', __('Order #:number is confirmed: :total. Track it live from this email.', ['number' => $order->order_number, 'total' => $money($order->total)]))
@section('band', __('Order confirmed'))

@section('content')
    <h1 class="eb-h1" style="margin:0 0 8px; font-size:23px; line-height:30px; font-weight:bold; color:#1C1408;">{{ __('Thank you, :name!', ['name' => $recipientName]) }}</h1>
    <p style="margin:0 0 22px; color:#6B5D4F;">{{ __('We\'ve got your order and the kitchen is on it. You can follow it live at any time.') }}</p>

    @include('emails.partials.button', ['url' => $trackingUrl, 'label' => __('Track your order'), 'margin' => '0 auto 24px'])

    @include('emails.partials.rows', ['rows' => array_values(array_filter([
        [__('Order number'), '#' . $order->order_number],
        [__('Type'), $typeLabels[$order->type] ?? ucfirst(str_replace('_', ' ', (string) $order->type))],
        $order->created_at ? [__('Placed'), $order->created_at->timezone($tz)->format('j M Y, g:i a')] : null,
        $order->paid_at ? [__('Paid'), $order->paid_at->timezone($tz)->format('j M Y, g:i a')] : null
    ]))])

    <p style="margin:0 0 8px; font-size:12px; line-height:16px; font-weight:bold; letter-spacing:1.2px; text-transform:uppercase; color:#6B5D4F;">{{ __('Your order') }}</p>
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
            <tr><td style="padding:4px 0; color:#6B5D4F;">{{ __('Subtotal') }}</td><td align="right" style="padding:4px 0; color:#1C1408;">{{ $money($order->subtotal) }}</td></tr>
        @endif
        @if ($discount > 0)
            <tr><td style="padding:4px 0; color:#6B5D4F;">{{ __('Discount') }}</td><td align="right" style="padding:4px 0; color:#16a34a;">− {{ $money($discount) }}</td></tr>
        @endif
        @if ($serviceCharge > 0)
            <tr><td style="padding:4px 0; color:#6B5D4F;">{{ $order->service_charge_label ?: 'Service charge' }}</td><td align="right" style="padding:4px 0; color:#1C1408;">{{ $money($serviceCharge) }}</td></tr>
        @endif
        @if ($deliveryFee > 0)
            <tr><td style="padding:4px 0; color:#6B5D4F;">{{ __('Delivery') }}</td><td align="right" style="padding:4px 0; color:#1C1408;">{{ $money($deliveryFee) }}</td></tr>
        @endif
        @if ($tax > 0)
            <tr><td style="padding:4px 0; color:#6B5D4F;">{{ __('GST') }}</td><td align="right" style="padding:4px 0; color:#1C1408;">{{ $money($tax) }}</td></tr>
        @endif
        <tr>
            <td style="padding:12px 0 0; border-top:2px solid #1C1408; font-size:17px; font-weight:bold; color:#1C1408;">{{ __('Total') }}</td>
            <td align="right" style="padding:12px 0 0; border-top:2px solid #1C1408; font-size:17px; font-weight:bold; color:{{ \App\Support\EmailBrand::variables()['primary'] }};">{{ $money($order->total) }}</td>
        </tr>
    </table>

    @php
        // The sale on the credit account, or from the wallet (owner, 2026-10-21).
        $account = \App\Support\ReceiptAccountLines::for($order);
    @endphp
    @if ($account['credit'] !== null)
        @php $cr = $account['credit']; @endphp
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin:0 0 16px; padding:12px 14px; background:#FBF6F0; border-radius:12px; font-size:14px; line-height:22px;">
            <tr><td colspan="2" style="padding:0 0 6px; font-weight:bold; color:#1C1408;">{{ __('Credit account') }}</td></tr>
            <tr><td style="color:#6B5D4F;">{{ __('Charged to your account') }}</td><td align="right" style="color:#1C1408;">{{ $money($cr['amount_laar'] / 100) }}</td></tr>
            @if ($cr['invoice_number'])
                <tr><td style="color:#6B5D4F;">{{ __('Invoice') }}</td><td align="right" style="color:#1C1408;">{{ $cr['invoice_number'] }}</td></tr>
            @endif
            @if ($cr['due_date'])
                <tr><td style="color:#6B5D4F;">{{ __('Due') }}</td><td align="right" style="color:#1C1408;">{{ \Illuminate\Support\Carbon::parse($cr['due_date'])->format('d M Y') }}</td></tr>
            @endif
            <tr><td style="color:#6B5D4F;">{{ __('You owe on your account') }}</td><td align="right" style="color:#1C1408;">{{ $money($cr['balance_laar'] / 100) }}</td></tr>
            <tr><td style="color:#6B5D4F;">{{ __('Available to use') }}</td><td align="right" style="color:#1C1408;">{{ $money($cr['available_laar'] / 100) }}</td></tr>
        </table>
        @if ($cr['pay_url'] && ! $cr['invoice_paid'])
            @include('emails.partials.button', [
                'url' => $cr['pay_url'],
                'label' => __('Pay online'),
                'margin' => '0 auto 22px',
            ])
        @endif
    @endif
    @if ($account['wallet'] !== null)
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin:0 0 22px; padding:12px 14px; background:#FBF6F0; border-radius:12px; font-size:14px; line-height:22px;">
            <tr><td colspan="2" style="padding:0 0 6px; font-weight:bold; color:#1C1408;">{{ __('Wallet') }}</td></tr>
            <tr><td style="color:#6B5D4F;">{{ $account['wallet']['shared_from'] ? __(":name's wallet paid", ['name' => $account['wallet']['shared_from']]) : __('Paid from your wallet') }}</td><td align="right" style="color:#1C1408;">{{ $money($account['wallet']['amount_laar'] / 100) }}</td></tr>
            <tr><td style="color:#6B5D4F;">{{ __('Wallet balance') }}</td><td align="right" style="color:#1C1408;">{{ $money($account['wallet']['balance_laar'] / 100) }}</td></tr>
        </table>
    @endif

    @if ($order->customer_notes)
        <p style="margin:0 0 22px; padding:12px 14px; background:#FBF6F0; border-radius:12px; font-size:13px; line-height:20px; color:#6B5D4F;"><strong style="color:#1C1408;">{{ __('Your note:') }}</strong> {{ $order->customer_notes }}</p>
    @endif

    @include('emails.partials.button', [
        'url' => \App\Support\ComplaintBoxLink::url('email', (string) $order->order_number),
        'label' => __('Report a problem with this order'),
        'variant' => 'outline',
        'margin' => '4px auto 0',
    ])
@endsection

@section('complaint_order', (string) $order->order_number)

@section('footer_note', __('You are receiving this because you placed order #:number.', ['number' => $order->order_number]))
