<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gift Card — Bake & Grill</title>
</head>
<body style="margin:0; padding:0; background:#f8fafc; font-family: Arial, sans-serif; color:#0f172a;">

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; padding:32px 0;">
        <tr>
            <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,0.07);">

                    <tr>
                        <td style="background:#D4813A; padding:28px 32px; text-align:center;">
                            <p style="margin:0; font-size:22px; font-weight:700; color:#ffffff; letter-spacing:0.3px;">
                                Bake &amp; Grill
                            </p>
                            <p style="margin:6px 0 0; font-size:13px; color:rgba(255,255,255,0.85);">
                                Gift Card
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding:32px;">

                            <p style="margin:0 0 6px; font-size:18px; font-weight:700; color:#0f172a;">
                                You've received a gift card
                            </p>
                            <p style="margin:0 0 24px; font-size:14px; color:#64748b;">
                                Use this code online or in-store at Bake &amp; Grill.
                            </p>

                            @if ($personalNote)
                            <p style="margin:0 0 24px; font-size:14px; color:#0f172a; background:#FEF3E8; border-radius:8px; padding:14px 16px; font-style:italic;">
                                {{ $personalNote }}
                            </p>
                            @endif

                            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border-radius:8px; margin-bottom:24px;">
                                <tr>
                                    <td style="padding:20px 16px; text-align:center;">
                                        <p style="margin:0 0 8px; font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.5px;">
                                            Gift card code
                                        </p>
                                        <p style="margin:0; font-family:Consolas, Monaco, monospace; font-size:22px; font-weight:700; letter-spacing:0.12em; color:#D4813A;">
                                            {{ strtoupper($plainCode) }}
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                                <tr>
                                    <td style="font-size:13px; color:#64748b; padding:6px 0;">Value</td>
                                    <td style="font-size:15px; font-weight:700; color:#D4813A; text-align:right; padding:6px 0;">
                                        MVR {{ number_format((float) $card->initial_balance, 2) }}
                                    </td>
                                </tr>
                                @if ($card->expires_at)
                                <tr>
                                    <td style="font-size:13px; color:#64748b; padding:6px 0;">Expires</td>
                                    <td style="font-size:13px; font-weight:600; color:#0f172a; text-align:right; padding:6px 0;">
                                        {{ $card->expires_at->format('d M Y') }}
                                    </td>
                                </tr>
                                @endif
                            </table>

                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                                <tr>
                                    <td align="center">
                                        <a href="{{ $redeemUrl }}"
                                           style="display:inline-block; background:#D4813A; color:#ffffff; text-decoration:none; font-size:14px; font-weight:700; padding:14px 28px; border-radius:8px;">
                                            Redeem online
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin:0; font-size:12px; color:#94a3b8; text-align:center; line-height:1.5;">
                                Keep this email safe — the code is only shown here and cannot be recovered later.
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td style="background:#f8fafc; padding:20px 32px; text-align:center; border-top:1px solid #e2e8f0;">
                            <p style="margin:0; font-size:12px; color:#94a3b8;">
                                Bake &amp; Grill · Malé, Maldives · WhatsApp +960 9120011
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>

</body>
</html>
