<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bake & Grill Receipt</title>
    <style>
        body { font-family: Arial, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
        .card { max-width: 720px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(15,23,42,0.12); }
        .muted { color: #64748b; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { text-align: left; padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
        .actions { display: flex; gap: 12px; margin-top: 16px; }
        .btn { display: inline-block; padding: 8px 14px; border-radius: 8px; border: 1px solid #e2e8f0; text-decoration: none; color: #0f172a; font-size: 14px; }
        .btn-primary { background: #0f172a; color: #fff; border-color: #0f172a; }
        .alert { padding: 10px 12px; border-radius: 8px; margin: 12px 0; font-size: 14px; }
        .alert-success { background: #ecfdf5; color: #047857; }
        .alert-error { background: #fef2f2; color: #b91c1c; }
        textarea, select { width: 100%; padding: 8px; border-radius: 8px; border: 1px solid #cbd5f5; }
        .section { margin-top: 24px; }
    </style>
</head>
<body>
    <div class="card">
        <h2>Bake & Grill</h2>
        <p class="muted">Receipt {{ $order->order_number ?? '' }}</p>

        @if (session('success'))
            <div class="alert alert-success">{{ session('success') }}</div>
        @endif
        @if (session('error'))
            <div class="alert alert-error">{{ session('error') }}</div>
        @endif

        <div class="section">
            <p><strong>Order Type:</strong> {{ $order->type }}</p>
            <p><strong>Status:</strong> {{ $order->status }}</p>
            <p><strong>Placed:</strong> {{ optional($order->created_at)->toDayDateTimeString() }}</p>
        </div>

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

        <div class="section">
            <p><strong>Subtotal:</strong> MVR {{ number_format($order->subtotal, 2) }}</p>
            <p><strong>Tax:</strong> MVR {{ number_format($order->tax_amount, 2) }}</p>
            <p><strong>Discount:</strong> MVR {{ number_format($order->discount_amount, 2) }}</p>
            <p><strong>Total:</strong> MVR {{ number_format($order->total, 2) }}</p>
        </div>

        <div class="actions">
            <a class="btn btn-primary" href="{{ url('/receipts/' . $receipt->token . '/pdf') }}">Download PDF</a>
            <form method="POST" action="{{ url('/receipts/' . $receipt->token . '/resend') }}">
                @csrf
                <button class="btn" type="submit">Resend</button>
            </form>
        </div>

        <div class="section">
            <h3>Share Feedback</h3>
            <form method="POST" action="{{ url('/receipts/' . $receipt->token . '/feedback') }}">
                @csrf
                <label class="muted">Rating</label>
                <select name="rating" required>
                    <option value="5">5 - Excellent</option>
                    <option value="4">4 - Good</option>
                    <option value="3">3 - Okay</option>
                    <option value="2">2 - Poor</option>
                    <option value="1">1 - Very poor</option>
                </select>
                <label class="muted">Comments (optional)</label>
                <textarea name="comments" rows="4" placeholder="Tell us how we did"></textarea>
                <div class="actions">
                    <button class="btn btn-primary" type="submit">Submit</button>
                </div>
            </form>
        </div>
    </div>
</body>
</html>
