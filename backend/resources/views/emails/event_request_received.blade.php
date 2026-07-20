<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Event request received — Bake &amp; Grill</title>
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
                                Malé, Maldives
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding:32px;">
                            <p style="margin:0 0 6px; font-size:18px; font-weight:700; color:#0f172a;">
                                Event request received
                            </p>
                            <p style="margin:0 0 24px; font-size:14px; color:#64748b;">
                                Hi {{ $recipientName }}, we received your event request
                                <strong>{{ $cateringRequest->reference }}</strong>. Our team will send your quote soon.
                            </p>

                            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border-radius:8px; padding:16px; margin-bottom:24px;">
                                <tr>
                                    <td style="font-size:13px; color:#64748b;">Reference</td>
                                    <td style="font-size:13px; font-weight:700; color:#0f172a; text-align:right;">
                                        {{ $cateringRequest->reference }}
                                    </td>
                                </tr>
                                @if ($cateringRequest->event_date)
                                <tr>
                                    <td style="font-size:13px; color:#64748b; padding-top:8px;">Event date</td>
                                    <td style="font-size:13px; font-weight:600; color:#0f172a; text-align:right; padding-top:8px;">
                                        {{ $cateringRequest->event_date->toDateString() }}
                                    </td>
                                </tr>
                                @endif
                                @if ($cateringRequest->fulfillment_method)
                                <tr>
                                    <td style="font-size:13px; color:#64748b; padding-top:8px;">Fulfilment</td>
                                    <td style="font-size:13px; font-weight:600; color:#0f172a; text-align:right; padding-top:8px;">
                                        {{ ucfirst($cateringRequest->fulfillment_method) }}
                                    </td>
                                </tr>
                                @endif
                            </table>

                            <p style="margin:0; font-size:13px; color:#64748b; line-height:1.5;">
                                Staff will confirm final pricing and any custom items. Reply to this email or message us if you need to change anything.
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>

</body>
</html>
