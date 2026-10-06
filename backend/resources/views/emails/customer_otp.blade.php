@extends('emails.layout')

@section('title', $isReset ? 'Password reset code' : 'Sign-in code')
@section('preheader', ($isReset ? 'Use ' . $otpCode . ' to set a new password.' : 'Use ' . $otpCode . ' to sign in.') . ' It works for ' . $expiresMinutes . ' minutes. Never share it.')
@section('band', $isReset ? 'Password reset' : 'Sign in')

@section('content')
    <h1 class="eb-h1" style="margin:0 0 8px; font-family:Arial, Helvetica, sans-serif; font-size:23px; line-height:30px; font-weight:bold; color:#1C1408;">
        {{ $isReset ? 'Your password reset code' : 'Your sign-in code' }}
    </h1>
    @php
        $acct = $maskedPhone ? ' for the account on <strong style="color:#1C1408; white-space:nowrap;">' . e($maskedPhone) . '</strong>' : '';
        $lead = $isReset
            ? 'Enter this code in ' . e($brandName) . ' to set a new password' . $acct . '.'
            : 'Enter this code in ' . e($brandName) . ' to sign in' . $acct . '.';
        if ($alsoTexted) {
            $lead .= ' The same code was sent to your phone by SMS; use whichever arrives first.';
        }
    @endphp
    <p style="margin:0 0 22px; color:#6B5D4F;">{!! $lead !!}</p>

    {{-- The code: one string (copies without spaces), large, in a dashed rust frame. --}}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;">
        <tr>
            <td align="center" style="background:#FEF3E8; border:2px dashed {{ \App\Support\EmailBrand::variables()['primary'] }}; border-radius:16px; padding:22px 12px 20px;">
                <p style="margin:0 0 6px; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:16px; font-weight:bold; letter-spacing:1.5px; text-transform:uppercase; color:#6B5D4F;">Your code</p>
                <p class="eb-code" style="margin:0; font-family:'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size:42px; line-height:50px; font-weight:bold; letter-spacing:12px; color:#1C1408; padding-left:12px;">{{ $otpCode }}</p>
            </td>
        </tr>
    </table>
    <p style="margin:0 0 24px; text-align:center; font-size:13px; line-height:20px; color:#6B5D4F;">
        Works until <strong style="color:#1C1408;">{{ $expiresAt->format('g:i a') }}</strong> ({{ $expiresMinutes }} minutes) · can be used once
    </p>

    @include('emails.partials.rows', ['rows' => array_values(array_filter([
        ['Asked for', $requestedAt->format('j M Y, g:i a') . ' Malé time'],
        $maskedPhone ? ['Account', $maskedPhone] : null,
        ['For', $isReset ? 'Setting a new password' : 'Signing in'],
    ]))])

    {{-- How to tell a real one, and what to do if it was not you. --}}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;">
        <tr>
            <td style="border-left:4px solid #1C1408; background:#F8F6F3; border-radius:0 12px 12px 0; padding:14px 16px; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:20px; color:#1C1408;">
                <strong>Keep this code to yourself.</strong> {{ $brandName }} staff will never ask for it, by phone, SMS or chat.
                <br><span style="color:#6B5D4F;">Didn't ask for it? Someone may have typed your number by mistake. Ignore this email: nobody can sign in without the code{{ $isReset ? ', and your password has not changed' : '' }}.</span>
            </td>
        </tr>
    </table>
@endsection

@section('footer_note')
    Sent because a code was requested on {{ $brandName }}{{ $maskedPhone ? ' for ' . $maskedPhone : '' }}. This address is the one saved on that account.
@endsection
