@extends('emails.layout')

@php
    $rust = \App\Support\EmailBrand::variables()['primary'];
    // The links are buttons below; the text itself is plain.
    $html = nl2br(e($body), false);
@endphp

@section('title', $heading)
@section('preheader', \Illuminate\Support\Str::limit(preg_replace('#https?://\S+#', '', $body), 120))
@section('band', match ($audience) { 'staff' => 'Staff alert', 'marketing' => 'News & offers', default => 'Message' })

@section('content')
    @if ($audience === 'staff')
        <p style="margin:0 0 6px; font-size:12px; line-height:16px; font-weight:bold; letter-spacing:1.4px; text-transform:uppercase; color:{{ $rust }};">For the team</p>
    @endif
    <h1 class="eb-h1" style="margin:0 0 14px; font-size:22px; line-height:29px; font-weight:bold; color:#1C1408;">
        {{ $greetingName ? 'Hi ' . $greetingName . ',' : $heading }}
    </h1>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
        <tr>
            <td style="border-left:4px solid {{ $audience === 'staff' ? '#1C1408' : $rust }}; background:{{ $audience === 'staff' ? '#F8F6F3' : '#FEF3E8' }}; border-radius:0 14px 14px 0; padding:16px 18px; font-size:16px; line-height:25px; color:#1C1408;">
                {!! $html !!}
            </td>
        </tr>
    </table>

    @foreach (array_slice($links, 0, 3) as $i => $link)
        @include('emails.partials.button', [
            'url' => $link['url'],
            'label' => $link['label'],
            'variant' => $i === 0 ? ($audience === 'staff' ? 'dark' : 'primary') : 'outline',
            'margin' => $i === 0 ? '4px auto 10px' : '0 auto 10px',
        ])
    @endforeach
@endsection

@section('footer_note')
    @if ($audience === 'staff')
        A copy of the alert texted to {{ $maskedPhone ?? 'your phone' }}. Alerts are switched on or off in Admin → SMS → Control Center.
    @else
        A copy of the text we sent to {{ $maskedPhone ?? 'your phone' }}.
    @endif
    @if ($unsubscribeUrl)
        <br><a href="{{ $unsubscribeUrl }}" style="color:#9C8E7E; text-decoration:underline;">Stop promotional messages (SMS and email)</a>. Order, payment and sign-in messages still come.
    @endif
@endsection
