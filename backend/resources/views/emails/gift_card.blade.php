@extends('emails.layout')

@php
    $value = 'MVR ' . number_format((float) $card->initial_balance, 2);
    $rust = \App\Support\EmailBrand::variables()['primary'];
@endphp

@section('title', 'Gift card ' . $value)
@section('preheader', ($senderFromLine ? $senderFromLine . ' sent you ' : 'You have received ') . 'a ' . $value . ' gift card. Your code is inside.')
@section('band', 'Gift card')

@section('content')
    <h1 class="eb-h1" style="margin:0 0 6px; font-size:23px; line-height:30px; font-weight:bold; color:#1C1408;">You've received a gift card</h1>
    @if (!empty($senderFromLine))
        <p style="margin:0 0 10px; font-size:15px; font-weight:bold; color:{{ $rust }};">{{ $senderFromLine }}</p>
    @endif
    <p style="margin:0 0 20px; color:#6B5D4F;">Use it online or at the counter at Bake &amp; Grill.</p>

    @if ($personalNote)
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
            <tr><td style="border-left:4px solid {{ $rust }}; background:#FEF3E8; border-radius:0 12px 12px 0; padding:14px 16px; font-size:15px; line-height:23px; font-style:italic; color:#1C1408;">“{{ $personalNote }}”</td></tr>
        </table>
    @endif

    {{-- The card --}}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
        <tr>
            <td style="background:{{ $rust }}; background-image:linear-gradient(135deg, {{ $rust }} 0%, #6B2C07 100%); border-radius:18px; padding:22px 22px 20px; color:#FFFDF9;">
                <p style="margin:0; font-size:12px; line-height:16px; font-weight:bold; letter-spacing:1.5px; text-transform:uppercase; color:rgba(255,253,249,0.8);">Gift card</p>
                <p style="margin:6px 0 16px; font-size:32px; line-height:38px; font-weight:bold; color:#FFFDF9;">{{ $value }}</p>
                <p style="margin:0 0 4px; font-size:11px; line-height:14px; font-weight:bold; letter-spacing:1.2px; text-transform:uppercase; color:rgba(255,253,249,0.75);">Code</p>
                <p style="margin:0; font-family:'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size:22px; line-height:28px; font-weight:bold; letter-spacing:3px; color:#FFFDF9;">{{ strtoupper($plainCode) }}</p>
                @if ($card->expires_at)
                    <p style="margin:14px 0 0; font-size:12px; line-height:16px; color:rgba(255,253,249,0.8);">Valid until {{ $card->expires_at->format('j M Y') }}</p>
                @endif
            </td>
        </tr>
    </table>

    @include('emails.partials.button', ['url' => $redeemUrl, 'label' => 'Use it online', 'margin' => '0 auto 10px'])
    @if (!empty($viewUrl))
        @include('emails.partials.button', ['url' => $viewUrl, 'label' => 'View your card', 'variant' => 'outline', 'margin' => '0 auto 18px'])
    @endif

    <p style="margin:12px 0 0; font-size:13px; line-height:20px; color:#6B5D4F; text-align:center;">At the counter, show this email or say the code. Keep it safe: anyone with the code can spend the card.</p>
@endsection

@section('footer_note', 'You are receiving this because a Bake & Grill gift card was sent to this address.')
