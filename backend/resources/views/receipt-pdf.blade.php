<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Receipt PDF</title>
    <style>
        body { font-family: DejaVu Sans, Arial, sans-serif; font-size: 12px; color: #0f172a; }
        h2 { margin-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { text-align: left; padding: 6px 0; border-bottom: 1px solid #e2e8f0; }
        .muted { color: #475569; }
        .totals { margin-top: 12px; }
    </style>
</head>
<body>
    <h2>Bake & Grill</h2>
    <p class="muted">Receipt {{ $order->order_number ?? '' }}</p>
    <p><strong>Order Type:</strong> {{ $order->type }}</p>
    <p><strong>Status:</strong> {{ $order->status }}</p>
    <p><strong>Placed:</strong> {{ optional($order->created_at)->toDayDateTimeString() }}</p>

    <table>
        <thead>
            <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Price</th>
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
                    <td>MVR {{ number_format($item->total_price, 2) }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <div class="totals">
        <p><strong>Subtotal:</strong> MVR {{ number_format($order->subtotal, 2) }}</p>
        <p><strong>Tax:</strong> MVR {{ number_format($order->tax_amount, 2) }}</p>
        <p><strong>Discount:</strong> MVR {{ number_format($order->discount_amount, 2) }}</p>
        <p><strong>Total:</strong> MVR {{ number_format($order->total, 2) }}</p>
    </div>
</body>
</html>
