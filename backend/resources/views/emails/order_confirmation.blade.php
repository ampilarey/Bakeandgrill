<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order Confirmed — Bake & Grill</title>
</head>
<body style="margin:0; padding:0; background:#f8fafc; font-family: Arial, sans-serif; color:#0f172a;">

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; padding:32px 0;">
        <tr>
            <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 6px rgba(0,0,0,0.07);">

                    {{-- Header --}}
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

                    {{-- Body --}}
                    <tr>
                        <td style="padding:32px;">

                            <p style="margin:0 0 6px; font-size:18px; font-weight:700; color:#0f172a;">
                                Order confirmed! ✅
                            </p>
                            <p style="margin:0 0 24px; font-size:14px; color:#64748b;">
                                Hi {{ $recipientName }}, your order has been received and is being prepared.
                            </p>

                            {{-- Order meta --}}
                            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border-radius:8px; padding:16px; margin-bottom:24px;">
                                <tr>
                                    <td style="font-size:13px; color:#64748b;">Order number</td>
                                    <td style="font-size:13px; font-weight:700; color:#0f172a; text-align:right;">
                                        #{{ $order->order_number }}
                                    </td>
                                </tr>
                                <tr>
                                    <td style="font-size:13px; color:#64748b; padding-top:8px;">Type</td>
                                    <td style="font-size:13px; font-weight:600; color:#0f172a; text-align:right; padding-top:8px;">
                                        @php
                                            $typeLabels = [
                                                'online_pickup' => 'Takeaway (Online)',
                                                'takeaway'      => 'Takeaway',
                                                'delivery'      => 'Delivery',
                                                'dine_in'       => 'Dine In',
                                                'preorder'      => 'Pre-order',
                                            ];
                                        @endphp
                                        {{ $typeLabels[$order->type] ?? $order->type }}
                                    </td>
                                </tr>
                            </table>

                            {{-- Items --}}
                            <p style="margin:0 0 10px; font-size:13px; font-weight:700; color:#0f172a; text-transform:uppercase; letter-spacing:0.5px;">
                                Items ordered
                            </p>
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
                                @foreach ($order->items as $item)
                                <tr>
                                    <td style="font-size:14px; color:#0f172a; padding:6px 0; border-bottom:1px solid #f1f5f9;">
                                        {{ $item->item_name ?? ($item->item?->name ?? 'Item') }}
                                        @if ($item->variant_name)
                                            <span style="color:#64748b; font-size:12px;"> — {{ $item->variant_name }}</span>
                                        @endif
                                    </td>
                                    <td style="font-size:13px; color:#64748b; text-align:center; padding:6px 8px; border-bottom:1px solid #f1f5f9; white-space:nowrap;">
                                        × {{ $item->quantity }}
                                    </td>
                                    <td style="font-size:14px; font-weight:600; color:#0f172a; text-align:right; padding:6px 0; border-bottom:1px solid #f1f5f9; white-space:nowrap;">
                                        MVR {{ number_format($item->total_price, 2) }}
                                    </td>
                                </tr>
                                @endforeach
                            </table>

                            {{-- Total --}}
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                                <tr>
                                    <td style="font-size:15px; font-weight:700; color:#0f172a; padding-top:4px;">Total</td>
                                    <td style="font-size:15px; font-weight:700; color:#D4813A; text-align:right; padding-top:4px;">
                                        MVR {{ number_format($order->total, 2) }}
                                    </td>
                                </tr>
                            </table>

                            {{-- CTA --}}
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                                <tr>
                                    <td align="center">
                                        <a href="{{ $trackingUrl }}"
                                           style="display:inline-block; background:#D4813A; color:#ffffff; font-size:15px; font-weight:700; text-decoration:none; padding:14px 32px; border-radius:8px;">
                                            Track your order →
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            {{-- Notes --}}
                            @if ($order->customer_notes)
                            <p style="margin:0 0 24px; font-size:13px; color:#64748b; background:#f8fafc; border-radius:6px; padding:12px;">
                                <strong>Your note:</strong> {{ $order->customer_notes }}
                            </p>
                            @endif

                        </td>
                    </tr>

                    {{-- Footer --}}
                    <tr>
                        <td style="background:#f1f5f9; padding:20px 32px; text-align:center; border-top:1px solid #e2e8f0;">
                            <p style="margin:0 0 6px; font-size:13px; color:#64748b;">
                                Questions? Contact us on
                                <a href="https://wa.me/9609120011" style="color:#D4813A; text-decoration:none;">WhatsApp</a>
                                or call
                                <a href="tel:+9609120011" style="color:#D4813A; text-decoration:none;">+960 912 0011</a>
                            </p>
                            <p style="margin:0; font-size:12px; color:#94a3b8;">
                                Bake &amp; Grill · Malé, Maldives
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>

</body>
</html>
