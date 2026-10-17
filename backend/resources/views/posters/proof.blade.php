<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Approve {{ $code }}</title>
</head>
<body style="font-family: sans-serif; margin: 24px; color: #1c1408;">
    <h1 style="font-size: 22px;">{{ $code }} · {{ $order->poster->name ?? 'Poster' }}</h1>
    <p>{{ $order->shop->name ?? 'Print shop' }} · {{ $order->material }} · {{ $order->state }}</p>
    @if ($order->state === 'draft')
        <form method="POST" action="{{ $approveUrl }}">
            @csrf
            <button type="submit" style="min-height: 44px; padding: 0 16px; background: #d4813a; color: #fff; border: 0; border-radius: 8px;">
                Approve and send to the shop
            </button>
        </form>
    @else
        <p>This poster is {{ str_replace('_', ' ', $order->state) }}.</p>
    @endif
</body>
</html>
