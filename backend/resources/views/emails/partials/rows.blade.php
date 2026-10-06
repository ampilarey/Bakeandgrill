{{-- Label / value rows in a soft cream panel. $rows: list of [label, value, emphasise?]. --}}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FBF6F0; border:1px solid #EDE4D4; border-radius:12px; margin:{{ $margin ?? '0 0 22px' }};">
    <tr><td style="padding:6px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            @foreach ($rows as $i => $row)
                <tr>
                    <td style="padding:9px 0; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:18px; color:#6B5D4F; {{ $i > 0 ? 'border-top:1px solid #EDE4D4;' : '' }}">{{ $row[0] }}</td>
                    <td align="right" style="padding:9px 0 9px 12px; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:18px; font-weight:bold; color:{{ !empty($row[2]) ? \App\Support\EmailBrand::variables()['primary'] : '#1C1408' }}; {{ $i > 0 ? 'border-top:1px solid #EDE4D4;' : '' }}">{{ $row[1] }}</td>
                </tr>
            @endforeach
        </table>
    </td></tr>
</table>
