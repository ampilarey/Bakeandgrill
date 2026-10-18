@extends('emails.layout')

@section('title', $w['title'])
@section('preheader', __('Use :code to :action. It works for :minutes minutes. Never share it.', ['code' => $otpCode, 'action' => $w['action'], 'minutes' => $expiresMinutes]))
@section('band', $w['band'])
@section('hide_complaint', '1')

@section('content')
    <h1 class="eb-h1" style="margin:0 0 8px; font-family:Arial, Helvetica, sans-serif; font-size:23px; line-height:30px; font-weight:bold; color:#1C1408;">
        {{ $w['h1'] }}
    </h1>
    @php
        $lead = $maskedPhone
            ? __('Enter this code in :brand to :action for the account on :phone.', ['brand' => e($brandName), 'action' => e($w['action']), 'phone' => '<strong style="color:#1C1408; white-space:nowrap;">' . e($maskedPhone) . '</strong>'])
            : __('Enter this code in :brand to :action.', ['brand' => e($brandName), 'action' => e($w['action'])]);
        if ($alsoTexted) {
            $lead .= ' ' . e(__('The same code was sent to your phone by SMS; use whichever arrives first.'));
        }
    @endphp
    <p style="margin:0 0 22px; color:#6B5D4F;">{!! $lead !!}</p>

    {{-- The code: one string (copies without spaces), large, in a dashed rust frame. --}}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;">
        <tr>
            <td align="center" style="background:#FEF3E8; border:2px dashed {{ \App\Support\EmailBrand::variables()['primary'] }}; border-radius:16px; padding:22px 12px 20px;">
                <p style="margin:0 0 6px; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:16px; font-weight:bold; letter-spacing:1.5px; text-transform:uppercase; color:#6B5D4F;">{{ __('Your code') }}</p>
                <p class="eb-code" style="margin:0; font-family:'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size:42px; line-height:50px; font-weight:bold; letter-spacing:12px; color:#1C1408; padding-left:12px;">{{ $otpCode }}</p>
            </td>
        </tr>
    </table>
    <p style="margin:0 0 24px; text-align:center; font-size:13px; line-height:20px; color:#6B5D4F;">
        {{ __('Works until') }} <strong style="color:#1C1408;">{{ $expiresAt->format('g:i a') }}</strong> {{ __('(:minutes minutes) · can be used once', ['minutes' => $expiresMinutes]) }}
    </p>

    @include('emails.partials.rows', ['rows' => array_values(array_filter([
        [__('Asked for'), $requestedAt->format('j M Y, g:i a') . ' ' . __('Malé time')],
        $maskedPhone ? [__('Account'), $maskedPhone] : null,
        [__('For'), $w['for']],
    ]))])

    {{-- How to tell a real one, and what to do if it was not you. --}}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;">
        <tr>
            <td style="border-left:4px solid #1C1408; background:#F8F6F3; border-radius:0 12px 12px 0; padding:14px 16px; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:20px; color:#1C1408;">
                <strong>{{ __('Keep this code to yourself.') }}</strong> {{ __(':brand staff will never ask for it, by phone, SMS or chat.', ['brand' => $brandName]) }}
                <br><span style="color:#6B5D4F;">{{ __('Didn\'t ask for it? Someone may have typed your number by mistake. Ignore this email: :nobody.', ['nobody' => $w['nobody']]) }}</span>
            </td>
        </tr>
    </table>
@endsection

@section('footer_note')
    {{ $maskedPhone ? __('Sent because a code was requested on :brand for :phone. This address is the one saved on that account.', ['brand' => $brandName, 'phone' => $maskedPhone]) : __('Sent because a code was requested on :brand. This address is the one saved on that account.', ['brand' => $brandName]) }}
@endsection
