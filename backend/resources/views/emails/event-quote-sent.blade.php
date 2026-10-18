@extends('emails.layout')

@php
    $money = fn ($laar) => 'MVR ' . number_format(((int) $laar) / 100, 2);
    $mvr = fn ($value) => 'MVR ' . number_format((float) $value, 2);
    $rust = \App\Support\EmailBrand::variables()['primary'];
@endphp

@section('title', __('Quote :ref', ['ref' => $request->reference]))
@section('preheader', __('Your quote :ref is ready: :total. View and accept it online.', ['ref' => $request->reference, 'total' => $money($taxPreview['total_laar'] ?? 0)]))
@section('band', __('Your event quote'))

@section('content')
    <h1 class="eb-h1" style="margin:0 0 8px; font-size:23px; line-height:30px; font-weight:bold; color:#1C1408;">{{ __('Your quote is ready') }}</h1>
    <p style="margin:0 0 22px; color:#6B5D4F;">
        @if ($request->event_date)
            {{ __('Hi :name, here is the itemised quote for :event on :date.', ['name' => $request->contact_name ?: __('there'), 'event' => $request->event_type ?: __('your event'), 'date' => \Illuminate\Support\Carbon::parse($request->event_date)->format('D, j M Y')]) }}
        @else
            {{ __('Hi :name, here is the itemised quote for :event.', ['name' => $request->contact_name ?: __('there'), 'event' => $request->event_type ?: __('your event')]) }}
        @endif
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px; font-size:14px; line-height:20px;">
        @foreach ($lines as $line)
            <tr>
                <td valign="top" style="padding:10px 0; border-bottom:1px solid #F0EBE5; color:#1C1408;">
                    <strong>{{ $line->quantity }} ×</strong> {{ $line->name }}
                    <br><span style="font-size:12px; color:#6B5D4F;">{{ __(':price each', ['price' => $mvr($line->unit_price ?? 0)]) }}</span>
                </td>
                <td valign="top" align="right" style="padding:10px 0 10px 12px; border-bottom:1px solid #F0EBE5; font-weight:bold; color:#1C1408; white-space:nowrap;">{{ $mvr((float) ($line->unit_price ?? 0) * $line->quantity) }}</td>
            </tr>
        @endforeach
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px; font-size:14px; line-height:20px;">
        <tr><td style="padding:4px 0; color:#6B5D4F;">{{ __('Subtotal') }}</td><td align="right" style="padding:4px 0;">{{ $money($taxPreview['subtotal_laar'] ?? 0) }}</td></tr>
        <tr><td style="padding:4px 0; color:#6B5D4F;">{{ __('GST') }}</td><td align="right" style="padding:4px 0;">{{ $money($taxPreview['tax_laar'] ?? 0) }}</td></tr>
        <tr>
            <td style="padding:12px 0 0; border-top:2px solid #1C1408; font-size:17px; font-weight:bold;">{{ __('Total') }}</td>
            <td align="right" style="padding:12px 0 0; border-top:2px solid #1C1408; font-size:17px; font-weight:bold; color:{{ $rust }};">{{ $money($taxPreview['total_laar'] ?? 0) }}</td>
        </tr>
    </table>

    @include('emails.partials.rows', ['rows' => array_values(array_filter([
        [$request->quote_is_deposit ? __('Deposit to pay now') : __('To pay now'), $money($request->quote_payment_laar ?? 0), true],
        $request->quote_expires_at ? [__('Quote valid until'), $request->quote_expires_at->timezone(config('app.timezone'))->format('D, j M Y g:i a')] : null,
    ]))])

    @include('emails.partials.button', ['url' => $quoteUrl, 'label' => __('View and accept the quote'), 'margin' => '0 auto 6px'])
@endsection

@section('footer_note', __('You are receiving this because you asked Bake & Grill for an event quote.'))
