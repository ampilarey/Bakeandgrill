<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Your Receipt</title>
</head>
<body style="font-family: Arial, sans-serif; color: #0f172a;">
    <h2>Bake & Grill</h2>
    <p>Thanks for visiting! Your receipt is ready.</p>
    <p>
        <strong>Order:</strong> {{ $order->order_number ?? '' }}<br>
        <strong>Total:</strong> MVR {{ number_format($order->total, 2) }}
    </p>
    <p>
        View receipt: <a href="{{ url('/receipts/' . $receipt->token) }}">Open Receipt</a>
    </p>
</body>
</html>
