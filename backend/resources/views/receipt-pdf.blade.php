<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Receipt {{ $order->order_number ?? '' }}</title>
    @php
        $typeLabels = [
            'dine_in' => 'Dine In',
            'takeaway' => 'Takeaway',
            'online_pickup' => 'Online Pickup',
            'delivery' => 'Delivery',
            'preorder' => 'Pre-order',
        ];
        $statusLabels = [
            'paid' => 'Paid',
            'completed' => 'Completed',
            'delivered' => 'Delivered',
            'refunded' => 'Refunded',
        ];
        $typeLabel = $typeLabels[$order->type ?? ''] ?? str_replace('_', ' ', (string) ($order->type ?? ''));
        $statusLabel = $statusLabels[$order->status ?? ''] ?? str_replace('_', ' ', (string) ($order->status ?? ''));
        $discount = (float) ($order->discount_amount ?? 0);
    @endphp
    <style>
        body { font-family: DejaVu Sans, Arial, sans-serif; font-size: 12px; color: #1C1408; }
        h2 { margin-bottom: 4px; color: #D4813A; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { text-align: left; padding: 6px 0; border-bottom: 1px solid #e2e8f0; }
        .muted { color: #6B5D4F; font-size: 11px; }
        .totals { margin-top: 12px; }
        .totals .grand { font-weight: bold; font-size: 13px; color: #D4813A; }
    </style>
</head>
<body>
    <h2>Bake & Grill</h2>
    <p class="muted">Receipt {{ $order->order_number ?? '' }}</p>
    <p><strong>Order type:</strong> {{ $typeLabel }}</p>
    <p><strong>Status:</strong> {{ $statusLabel }}</p>
    <p><strong>Placed:</strong> {{ optional($order->created_at)->toDayDateTimeString() }}</p>
    @if ($order->paid_at)
        <p><strong>Paid:</strong> {{ $order->paid_at->toDayDateTimeString() }}</p>
    @endif

    <table>
        <thead>
            <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>MVR</th>
            </tr>
        </thead>
        <tbody>
            @foreach ($order->items as $item)
                <tr>
                    <td>
                        {{ $item->item_name }}
                        @if ($item->modifiers->count() > 0)
                            <div class="muted">
                                {{ $item->modifiers->map(fn ($mod) => $mod->modifier_name)->join(', ') }}
                            </div>
                        @endif
                    </td>
                    <td>{{ $item->quantity }}</td>
                    <td>{{ number_format((float) $item->total_price, 2) }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <div class="totals">
        <p><strong>Subtotal:</strong> MVR {{ number_format((float) $order->subtotal, 2) }}</p>
        <p><strong>Tax:</strong> MVR {{ number_format((float) $order->tax_amount, 2) }}</p>
        @if ($discount > 0.0001)
            <p><strong>Discount:</strong> MVR {{ number_format($discount, 2) }}</p>
        @endif
        <p class="grand"><strong>Total:</strong> MVR {{ number_format((float) $order->total, 2) }}</p>
    </div>

    @if ($order->payments->count() > 0)
        <p style="margin-top: 14px;"><strong>Payments</strong></p>
        @foreach ($order->payments as $p)
            @php
                $st = $p->status ?? 'paid';
                $showPay = in_array($st, ['paid', 'completed', 'confirmed'], true);
            @endphp
            @if ($showPay)
                <p>{{ str_replace('_', ' ', ucfirst($p->method ?? 'Payment')) }}: MVR {{ number_format((float) $p->amount, 2) }}</p>
            @endif
        @endforeach
    @endif
</body>
</html>
