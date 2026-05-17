<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    @php
        $order = $receipt->order;
        $isPaid = $order->paid_at !== null
            || in_array($order->status ?? '', ['paid', 'completed', 'delivered', 'refunded'], true);
        $docTitle = $isPaid ? 'Receipt' : 'Invoice';
        $typeLabels = [
            'dine_in' => 'Dine In',
            'takeaway' => 'Takeaway',
            'online_pickup' => 'Online Pickup',
            'delivery' => 'Delivery',
            'preorder' => 'Pre-order',
        ];
        $statusLabels = [
            'payment_pending' => 'Awaiting payment',
            'pending' => 'Pending',
            'paid' => 'Paid',
            'partial' => 'Partially paid',
            'in_progress' => 'In progress',
            'preparing' => 'Preparing',
            'ready' => 'Ready',
            'held' => 'On hold',
            'completed' => 'Completed',
            'delivered' => 'Delivered',
            'cancelled' => 'Cancelled',
            'refunded' => 'Refunded',
        ];
        $typeLabel = $typeLabels[$order->type ?? ''] ?? str_replace('_', ' ', (string) ($order->type ?? ''));
        $statusLabel = $statusLabels[$order->status ?? ''] ?? str_replace('_', ' ', (string) ($order->status ?? ''));
        $logoUrl = \App\Models\SiteSetting::get('logo', '');
        $siteName = \App\Models\SiteSetting::get('site_name', 'Bake & Grill');
        $discount = (float) ($order->discount_amount ?? 0);
    @endphp
    <title>{{ $siteName }} — {{ $docTitle }} {{ $order->order_number ?? '' }}</title>
    <style>
        :root { --brand: #D4813A; --ink: #1C1408; --muted: #6B5D4F; --line: #E8E0D8; --bg: #F8F6F3; --warn-bg: #fffbeb; --warn-border: #f59e0b; --ok-bg: #ecfdf5; --ok-border: #22c55e; }
        * { box-sizing: border-box; }
        body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background: var(--bg); color: var(--ink); margin: 0; padding: 16px; min-height: 100vh; }
        .wrap { max-width: 480px; margin: 0 auto; }
        .card { background: #fff; border-radius: 16px; padding: 20px 18px; box-shadow: 0 2px 12px rgba(28, 20, 8, 0.08); border: 1px solid var(--line); }
        .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
        .brand img { max-height: 44px; max-width: 160px; object-fit: contain; }
        .brand h1 { margin: 0; font-size: 1.35rem; font-weight: 800; color: var(--ink); letter-spacing: -0.02em; }
        .sub { color: var(--muted); font-size: 0.9rem; margin: 0 0 16px; }
        .banner { border-radius: 12px; padding: 12px 14px; font-size: 0.9rem; font-weight: 600; margin-bottom: 18px; line-height: 1.4; }
        .banner-pending { background: var(--warn-bg); border: 1px solid var(--warn-border); color: #92400e; }
        .banner-paid { background: var(--ok-bg); border: 1px solid var(--ok-border); color: #166534; }
        .meta { display: grid; gap: 8px; margin-bottom: 18px; font-size: 0.9rem; }
        .meta-row { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .meta-row span:first-child { color: var(--muted); font-weight: 600; }
        table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        th { text-align: left; color: var(--muted); font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; padding: 8px 0; border-bottom: 2px solid var(--line); }
        td { padding: 10px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
        .qty { text-align: center; width: 2.5rem; color: var(--muted); font-weight: 600; }
        .price { text-align: right; font-weight: 700; white-space: nowrap; }
        .mods { font-size: 0.8rem; color: var(--muted); margin-top: 4px; }
        .totals { margin-top: 16px; padding-top: 12px; border-top: 2px solid var(--line); }
        .totals p { display: flex; justify-content: space-between; margin: 6px 0; font-size: 0.95rem; }
        .totals .grand { font-size: 1.15rem; font-weight: 800; color: var(--brand); margin-top: 10px; }
        .payments { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--line); }
        .payments h3 { margin: 0 0 8px; font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
        .pay-row { display: flex; justify-content: space-between; font-size: 0.9rem; padding: 4px 0; }
        .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
        .btn { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 16px; border-radius: 10px; border: 1px solid var(--line); text-decoration: none; color: var(--ink); font-size: 0.95rem; font-weight: 600; font-family: inherit; cursor: pointer; background: #fff; }
        .btn-primary { background: var(--brand); border-color: var(--brand); color: #fff; }
        .feedback { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--line); }
        .feedback h3 { margin: 0 0 12px; font-size: 1rem; }
        label { display: block; font-size: 0.8rem; color: var(--muted); font-weight: 600; margin-bottom: 4px; }
        select, textarea { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); font-size: 0.95rem; font-family: inherit; }
        textarea { min-height: 88px; resize: vertical; }
        .alert { padding: 10px 12px; border-radius: 10px; margin-bottom: 12px; font-size: 0.9rem; }
        .alert-success { background: var(--ok-bg); color: #166534; border: 1px solid var(--ok-border); }
        .alert-error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
    </style>
</head>
<body>
    <div class="wrap">
        <div class="card">
            <div class="brand">
                @if ($logoUrl)
                    <img src="{{ $logoUrl }}" alt="{{ $siteName }}">
                @else
                    <h1>{{ $siteName }}</h1>
                @endif
            </div>
            @if (!$logoUrl)
                <p class="sub" style="margin-top: -8px;">{{ $docTitle }} {{ $order->order_number ?? '' }}</p>
            @else
                <p class="sub">{{ $docTitle }} — {{ $order->order_number ?? '' }}</p>
            @endif

            @if (session('success'))
                <div class="alert alert-success">{{ session('success') }}</div>
            @endif
            @if (session('error'))
                <div class="alert alert-error">{{ session('error') }}</div>
            @endif

            @if (!$isPaid)
                <div class="banner banner-pending">
                    Payment pending — this is your bill. Totals may update until payment is received. Refresh after you pay to see your receipt.
                </div>
            @else
                <div class="banner banner-paid">
                    Payment confirmed
                    @if ($order->paid_at)
                        — {{ $order->paid_at->timezone(config('app.timezone', 'Indian/Maldives'))->format('D, j M Y g:i A') }}
                    @endif
                </div>
            @endif

            <div class="meta">
                <div class="meta-row"><span>Order type</span><span>{{ $typeLabel }}</span></div>
                <div class="meta-row"><span>Status</span><span style="text-transform: capitalize">{{ $statusLabel }}</span></div>
                <div class="meta-row"><span>Placed</span><span>{{ optional($order->created_at)->timezone(config('app.timezone', 'Indian/Maldives'))->format('D, j M Y g:i A') }}</span></div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Item</th>
                        <th class="qty">Qty</th>
                        <th class="price">MVR</th>
                    </tr>
                </thead>
                <tbody>
                    @foreach ($order->items as $item)
                        <tr>
                            <td>
                                <strong>{{ $item->item_name }}</strong>
                                @if ($item->modifiers->count() > 0)
                                    <div class="mods">{{ $item->modifiers->map(fn ($mod) => $mod->modifier_name)->join(', ') }}</div>
                                @endif
                            </td>
                            <td class="qty">{{ $item->quantity }}</td>
                            <td class="price">{{ number_format((float) $item->total_price, 2) }}</td>
                        </tr>
                    @endforeach
                </tbody>
            </table>

            <div class="totals">
                <p><span>Subtotal</span><span>MVR {{ number_format((float) $order->subtotal, 2) }}</span></p>
                <p><span>Tax</span><span>MVR {{ number_format((float) $order->tax_amount, 2) }}</span></p>
                @if ($discount > 0.0001)
                    <p><span>Discount</span><span>− MVR {{ number_format($discount, 2) }}</span></p>
                @endif
                <p class="grand"><span>Total</span><span>MVR {{ number_format((float) $order->total, 2) }}</span></p>
            </div>

            @if ($isPaid && $order->payments->count() > 0)
                <div class="payments">
                    <h3>Payments</h3>
                    @foreach ($order->payments as $p)
                        @php
                            $st = $p->status ?? 'paid';
                            $showPay = in_array($st, ['paid', 'completed', 'confirmed'], true);
                        @endphp
                        @if ($showPay)
                            <div class="pay-row">
                                <span style="text-transform: capitalize">{{ str_replace('_', ' ', $p->method ?? 'Payment') }}</span>
                                <span>MVR {{ number_format((float) $p->amount, 2) }}</span>
                            </div>
                        @endif
                    @endforeach
                </div>
            @endif

            <div class="actions">
                @if ($isPaid)
                    <a class="btn btn-primary" href="{{ url('/receipts/' . $receipt->token . '/pdf') }}">Download PDF</a>
                    <form method="POST" action="{{ url('/receipts/' . $receipt->token . '/resend') }}" style="display:inline;">
                        @csrf
                        <button class="btn" type="submit">Resend to phone</button>
                    </form>
                @endif
            </div>

            @if ($isPaid)
                <div class="feedback">
                    <h3>Share feedback</h3>
                    <form method="POST" action="{{ url('/receipts/' . $receipt->token . '/feedback') }}">
                        @csrf
                        <label for="rating">Rating</label>
                        <select name="rating" id="rating" required style="margin-bottom: 10px;">
                            <option value="5">5 — Excellent</option>
                            <option value="4">4 — Good</option>
                            <option value="3">3 — Okay</option>
                            <option value="2">2 — Poor</option>
                            <option value="1">1 — Very poor</option>
                        </select>
                        <label for="comments">Comments (optional)</label>
                        <textarea name="comments" id="comments" rows="4" placeholder="Tell us how we did"></textarea>
                        <div class="actions" style="margin-top: 12px;">
                            <button class="btn btn-primary" type="submit">Submit feedback</button>
                        </div>
                    </form>
                </div>
            @endif
        </div>
    </div>

    {{-- Auto-trigger print when the POS pops this page with ?print=1.
         The 350ms delay lets webfonts/logos paint so the dialog
         preview reflects the final layout instead of a half-rendered page. --}}
    @if(request()->boolean('print'))
        <script>
            (function () {
                window.addEventListener('load', function () {
                    setTimeout(function () { try { window.print(); } catch (e) {} }, 350);
                });
            })();
        </script>
    @endif
</body>
</html>
