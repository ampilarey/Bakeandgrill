<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Invoice {{ $invoice->invoice_number }}</title>
    <style>
        body { font-family: DejaVu Sans, Arial, sans-serif; font-size: 12px; color: #0f172a; }
        h2 { margin-bottom: 4px; }
        .muted { color: #475569; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { text-align: left; padding: 6px 0; border-bottom: 1px solid #e2e8f0; }
        .amount { text-align: right; }
        .totals { margin-top: 12px; }
        .totals p { display: flex; justify-content: space-between; margin: 3px 0; }
        .grand { font-weight: 700; font-size: 13px; border-top: 1px solid #0f172a; padding-top: 4px; margin-top: 4px; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 11px; letter-spacing: 0.5px; }
        .badge-paid { color: #047857; }
        .badge-unpaid { color: #b91c1c; }
    </style>
</head>
<body>
    <h2>{{ \App\Models\SiteSetting::get('site_name', 'Bake & Grill') }}</h2>
    <p class="muted">{{ \App\Models\SiteSetting::get('business_address', '') }}</p>
    <p class="muted">{{ \App\Models\SiteSetting::get('business_phone', '') }}</p>

    <p><strong>Invoice:</strong> {{ $invoice->invoice_number }}
       &nbsp;&nbsp;
       <span class="badge {{ $invoice->status === 'paid' ? 'badge-paid' : 'badge-unpaid' }}">
           {{ strtoupper($invoice->status) }}
       </span>
    </p>
    <p><strong>Date:</strong> {{ optional($invoice->issue_date)->format('d M Y') ?? optional($invoice->created_at)->format('d M Y') }}</p>
    @if ($invoice->customer || $invoice->recipient_name)
        <p><strong>Bill To:</strong> {{ $invoice->customer->name ?? $invoice->recipient_name }}
            @if ($invoice->customer->phone ?? $invoice->recipient_phone)
                — {{ $invoice->customer->phone ?? $invoice->recipient_phone }}
            @endif
        </p>
    @endif

    <table>
        <thead>
            <tr>
                <th>Description</th>
                <th>Qty</th>
                <th class="amount">Unit</th>
                <th class="amount">Total</th>
            </tr>
        </thead>
        <tbody>
            @forelse ($invoice->items as $item)
                <tr>
                    <td>{{ $item->description ?? $item->name }}</td>
                    <td>{{ $item->quantity ?? 1 }}</td>
                    <td class="amount">MVR {{ number_format((float)($item->unit_price ?? $item->amount), 2) }}</td>
                    <td class="amount">MVR {{ number_format((float)($item->total ?? ($item->unit_price * ($item->quantity ?? 1))), 2) }}</td>
                </tr>
            @empty
                @if ($invoice->order)
                    @foreach ($invoice->order->items as $orderItem)
                        <tr>
                            <td>{{ $orderItem->item_name }}</td>
                            <td>{{ $orderItem->quantity }}</td>
                            <td class="amount">MVR {{ number_format((float)$orderItem->unit_price, 2) }}</td>
                            <td class="amount">MVR {{ number_format((float)$orderItem->total_price, 2) }}</td>
                        </tr>
                    @endforeach
                @endif
            @endforelse
        </tbody>
    </table>

    <div class="totals">
        <p><span>Subtotal</span><span>MVR {{ number_format((float)$invoice->subtotal, 2) }}</span></p>
        @if ((float)($invoice->tax_amount ?? 0) > 0)
            <p><span>Tax</span><span>MVR {{ number_format((float)$invoice->tax_amount, 2) }}</span></p>
        @endif
        @if ((float)($invoice->discount_amount ?? 0) > 0)
            <p><span>Discount</span><span>− MVR {{ number_format((float)$invoice->discount_amount, 2) }}</span></p>
        @endif
        <p class="grand"><span>Total</span><span>MVR {{ number_format((float)$invoice->total, 2) }}</span></p>
    </div>

    @if ($invoice->notes)
        <p class="muted" style="margin-top:16px;">Notes: {{ $invoice->notes }}</p>
    @endif
</body>
</html>
