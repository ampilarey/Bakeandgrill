{{-- Bulletproof button: a table cell, so it stays a button in every mail app.
     $url, $label, optional $variant: primary (rust, default) | dark | outline. --}}
@php
    $rust = \App\Support\EmailBrand::variables()['primary'];
    $variant = $variant ?? 'primary';
    $bg = $variant === 'dark' ? '#1C1408' : ($variant === 'outline' ? '#FFFFFF' : $rust);
    $fg = $variant === 'outline' ? $rust : '#FFFFFF';
    $border = $variant === 'outline' ? $rust : $bg;
@endphp
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:{{ $margin ?? '8px auto 4px' }};">
    <tr>
        <td align="center" style="background:{{ $bg }}; border:2px solid {{ $border }}; border-radius:12px;">
            <a href="{{ $url }}" target="_blank" style="display:inline-block; padding:13px 28px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:20px; font-weight:bold; color:{{ $fg }}; text-decoration:none; border-radius:12px;">{{ $label }}</a>
        </td>
    </tr>
</table>
