@extends('emails.layout')

@php
    $rust = \App\Support\EmailBrand::variables()['primary'];
    $label = fn (string $en, string $dvText) => $dv ? $dvText : $en;
    $money = fn ($v) => 'MVR ' . number_format((float) $v, 2);
@endphp
@section('title', $subjectLine)
@section('preheader', \Illuminate\Support\Str::limit(strip_tags($body), 110))
@section('band', $label('Newsletter', 'ނިއުސްލެޓަރ'))

@section('content')
    <div @if($dv) dir="rtl" lang="dv" @endif>
        @if ($headerImage)
            <img src="{{ $headerImage }}" alt="" width="520" style="display:block; width:100%; max-width:520px; height:auto; border-radius:14px; margin:0 0 18px;">
        @endif
        <h1 class="eb-h1" style="margin:0 0 12px; font-size:22px; line-height:29px; font-weight:bold; color:#1C1408;">{{ $subjectLine }}</h1>
        @if (trim($body) !== '')
            <p style="margin:0 0 20px; color:#1C1408; font-size:16px; line-height:25px;">{!! nl2br(e($body), false) !!}</p>
        @endif

        @foreach ([['new', $label('New on the menu', 'މެނޫއަށް އައު')], ['coming', $label('Coming soon', 'ވަރަށް އަވަހަށް')]] as [$key, $heading])
            @if (!empty($picks[$key]))
                <h2 style="margin:18px 0 10px; font-size:17px; color:{{ $rust }};">{{ $heading }}</h2>
                @foreach ($picks[$key] as $dish)
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;">
                        <tr>
                            @if (!empty($dish['image']))
                                <td width="72" style="padding-{{ $dv ? 'left' : 'right' }}:12px;"><img src="{{ $dish['image'] }}" alt="" width="64" height="64" style="display:block; border-radius:10px; object-fit:cover;"></td>
                            @endif
                            <td style="font-size:15px; color:#1C1408;">
                                <a href="{{ $dish['url'] }}" style="color:#1C1408; font-weight:bold; text-decoration:none;">{{ $dv && !empty($dish['name_dv']) ? $dish['name_dv'] : $dish['name'] }}</a>
                                <br><span style="color:#6B5D4F; font-size:13px;">{{ $money($dish['price']) }}</span>
                            </td>
                        </tr>
                    </table>
                @endforeach
            @endif
        @endforeach

        @if (!empty($picks['specials']))
            <h2 style="margin:18px 0 10px; font-size:17px; color:{{ $rust }};">{{ $label('Daily specials', 'ޚާއްޞަ ކާނާ') }}</h2>
            @foreach ($picks['specials'] as $s)
                <p style="margin:0 0 6px; font-size:15px; color:#1C1408;">{{ $s['name'] }} · {{ $money($s['price']) }}</p>
            @endforeach
        @endif

        @if (!empty($picks['offer']))
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;">
                <tr><td style="border-{{ $dv ? 'right' : 'left' }}:4px solid {{ $rust }}; background:#FEF3E8; border-radius:12px; padding:14px 16px; color:#1C1408;">
                    <strong>{{ $picks['offer']['name'] }}</strong>
                    @if ($picks['offer']['description'] !== '')<br>{{ $picks['offer']['description'] }}@endif
                    @if (!empty($picks['offer']['code']))<br>{{ $label('Code', 'ކޯޑު') }}: <strong>{{ $picks['offer']['code'] }}</strong>@endif
                </td></tr>
            </table>
        @endif

        <p style="margin:22px 0 0;">
            <a href="{{ url('/order/menu') }}" style="display:inline-block; background:{{ $rust }}; color:#FFFDF9; font-weight:bold; text-decoration:none; padding:12px 22px; border-radius:12px;">{{ $label('Order now', 'މިހާރު އޯޑަރ ކުރޭ') }}</a>
        </p>
    </div>
@endsection

@section('footer_note')
    @if ($unsubscribeUrl)
        {{ $label('You get this because you signed up for our newsletter.', 'ތިބާ ނިއުސްލެޓަރއަށް ސައިން އަޕް ކުރި ސަބަބުން މި ލިބެނީ.') }}
        <a href="{{ $unsubscribeUrl }}" style="color:inherit;">{{ $label('Unsubscribe', 'ހުއްޓާލާ') }}</a>
    @else
        {{ $label('This is a test send.', 'މިއީ ޓެސްޓެއް.') }}
    @endif
@endsection
