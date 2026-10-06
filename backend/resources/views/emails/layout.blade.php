{{--
  Shared look for every customer email (owner, 2026-10-06: "Enhance the
  email send with branding"). Rust band with the logo in a cream circle,
  a white card, the business's own contact details in the footer.

  Sections: title, preheader (inbox preview line), band (line under the
  name), content, footer_note (why they got this email).
  Inline styles throughout: many mail apps drop <style> blocks.
--}}
@php
    $brand = \App\Support\EmailBrand::variables();
    $rust = $brand['primary'];
    // Embedded (cid:) when sending, so the logo shows even where pictures
    // are blocked; the public URL when previewed or rendered for a test.
    $logoSrc = (isset($message) && $message instanceof \Illuminate\Mail\Message && $brand['logoPath'])
        ? $message->embed($brand['logoPath'])
        : $brand['logoUrl'];
@endphp
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="x-apple-disable-message-reformatting">
    {{-- Keep the brand colours: stop mail apps inverting the design in dark mode. --}}
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>@yield('title') · {{ $brand['name'] }}</title>
    <style>
        @media only screen and (max-width: 480px) {
            .eb-pad { padding-left: 20px !important; padding-right: 20px !important; }
            .eb-code { font-size: 34px !important; letter-spacing: 8px !important; }
            .eb-h1 { font-size: 21px !important; }
        }
        a { color: {{ $rust }}; }
    </style>
</head>
<body style="margin:0; padding:0; background:#F6EFE7; -webkit-text-size-adjust:100%;">
    {{-- Inbox preview line, hidden in the message itself. --}}
    <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#F6EFE7; opacity:0;">
        @yield('preheader')&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F6EFE7;">
        <tr>
            <td align="center" style="padding:28px 12px 36px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

                    {{-- Band: logo well, name, line --}}
                    <tr>
                        <td align="center" style="background:{{ $rust }}; background-image:linear-gradient(150deg, {{ $rust }} 0%, #8C3807 100%); border-radius:18px 18px 0 0; padding:28px 24px 24px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td align="center" width="84" height="84" style="width:84px; height:84px; background:#FFFAF3; border-radius:45px; border:3px solid rgba(255,253,249,0.35);">
                                        <img src="{{ $logoSrc }}" width="60" alt="{{ $brand['name'] }}" style="display:block; width:60px; height:auto; max-height:60px; margin:0 auto; border:0; outline:none;">
                                    </td>
                                </tr>
                            </table>
                            <p style="margin:14px 0 0; font-family:Arial, Helvetica, sans-serif; font-size:20px; line-height:26px; font-weight:bold; color:#FFFDF9;">{{ $brand['name'] }}</p>
                            @hasSection('band')
                                <p style="margin:4px 0 0; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:18px; color:rgba(255,253,249,0.85);">@yield('band')</p>
                            @endif
                        </td>
                    </tr>

                    {{-- Card --}}
                    <tr>
                        <td class="eb-pad" style="background:#FFFFFF; padding:32px 36px 30px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:23px; color:#1C1408;">
                            @yield('content')
                        </td>
                    </tr>

                    {{-- Contact strip --}}
                    <tr>
                        <td class="eb-pad" align="center" style="background:#FEF3E8; border-top:1px solid #EDE4D4; border-radius:0 0 18px 18px; padding:18px 36px; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:20px; color:#6B5D4F;">
                            Questions? We're happy to help.<br>
                            @if ($brand['whatsappUrl'])
                                <a href="{{ $brand['whatsappUrl'] }}" style="color:{{ $rust }}; font-weight:bold; text-decoration:none;">WhatsApp</a>
                            @endif
                            @if ($brand['whatsappUrl'] && $brand['phone']) &nbsp;·&nbsp; @endif
                            @if ($brand['phone'])
                                <a href="{{ $brand['phoneHref'] }}" style="color:{{ $rust }}; font-weight:bold; text-decoration:none;">Call {{ $brand['phone'] }}</a>
                            @endif
                            &nbsp;·&nbsp;
                            <a href="{{ $brand['orderUrl'] }}" style="color:{{ $rust }}; font-weight:bold; text-decoration:none;">Order online</a>
                        </td>
                    </tr>

                    {{-- Footer --}}
                    <tr>
                        <td align="center" style="padding:18px 24px 0; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:18px; color:#9C8E7E;">
                            @hasSection('footer_note')
                                <p style="margin:0 0 8px;">@yield('footer_note')</p>
                            @endif
                            <p style="margin:0;">
                                {{ $brand['name'] }}@if ($brand['address']) · {{ $brand['address'] }}@endif
                                <br><a href="{{ $brand['websiteUrl'] }}" style="color:#9C8E7E; text-decoration:underline;">{{ preg_replace('#^https?://#', '', $brand['websiteUrl']) }}</a>
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
