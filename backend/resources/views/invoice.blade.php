<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice {{ $invoice->invoice_number }} — Bake &amp; Grill</title>
    <style>
        body { font-family: Arial, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
        .card { max-width: 720px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(15,23,42,0.12); }
        .muted { color: #64748b; font-size: 14px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 13px; font-weight: 600; }
        .badge-paid { background: #ecfdf5; color: #047857; }
        .badge-unpaid { background: #fef2f2; color: #b91c1c; }
        .badge-draft { background: #f1f5f9; color: #475569; }
        .badge-sent { background: #eff6ff; color: #1d4ed8; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { text-align: left; padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
        th { color: #64748b; font-size: 13px; }
        .amount { text-align: right; }
        .actions { display: flex; gap: 12px; margin-top: 16px; flex-wrap: wrap; }
        .btn { display: inline-block; padding: 8px 14px; border-radius: 8px; border: 1px solid #e2e8f0; text-decoration: none; color: #0f172a; font-size: 14px; }
        .btn-primary { background: #0f172a; color: #fff; border-color: #0f172a; }
        .section { margin-top: 24px; }
        .totals { margin-top: 16px; padding-top: 16px; border-top: 2px solid #0f172a; }
        .totals p { display: flex; justify-content: space-between; margin: 4px 0; font-size: 14px; }
        .totals .grand { font-weight: 700; font-size: 16px; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-top: 16px; font-size: 14px; }
        @media (max-width: 540px) {
            .meta-grid { grid-template-columns: 1fr; }
            .header { flex-direction: column; }
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <div>
                @php $logo = \App\Models\SiteSetting::get('logo'); @endphp
                @if ($logo)
                    <img src="{{ $logo }}" alt="Logo" style="height:48px;margin-bottom:8px;">
                @endif
                <h2 style="margin:0;">{{ \App\Models\SiteSetting::get('site_name', 'Bake & Grill') }}</h2>
                <p class="muted">{{ \App\Models\SiteSetting::get('business_address', '') }}</p>
                <p class="muted">{{ \App\Models\SiteSetting::get('business_phone', '') }}</p>
            </div>
            <div style="text-align:right;">
                <p style="font-size:20px;font-weight:700;margin:0 0 4px;">INVOICE</p>
                <p class="muted" style="margin:0;">{{ $invoice->invoice_number }}</p>
                <p style="margin:8px 0 4px;">
                    @php
                        $badgeClass = match($invoice->status) {
                            'paid'  => 'badge-paid',
                            'draft' => 'badge-draft',
                            'sent'  => 'badge-sent',
                            default => 'badge-unpaid',
                        };
                    @endphp
                    <span class="badge {{ $badgeClass }}">{{ strtoupper($invoice->status) }}</span>
                </p>
            </div>
        </div>

        <div class="meta-grid">
            @if ($invoice->customer)
                <div>
                    <p class="muted" style="margin:0 0 2px;">Bill To</p>
                    <p style="margin:0;font-weight:600;">{{ $invoice->customer->name ?? $invoice->recipient_name }}</p>
                    @if ($invoice->customer->phone ?? $invoice->recipient_phone)
                        <p class="muted" style="margin:0;">{{ $invoice->customer->phone ?? $invoice->recipient_phone }}</p>
                    @endif
                </div>
            @elseif ($invoice->recipient_name)
                <div>
                    <p class="muted" style="margin:0 0 2px;">Bill To</p>
                    <p style="margin:0;font-weight:600;">{{ $invoice->recipient_name }}</p>
                    @if ($invoice->recipient_phone)
                        <p class="muted" style="margin:0;">{{ $invoice->recipient_phone }}</p>
                    @endif
                </div>
            @endif
            <div>
                <p class="muted" style="margin:0 0 2px;">Invoice Date</p>
                <p style="margin:0;">{{ optional($invoice->issue_date)->format('d M Y') ?? optional($invoice->created_at)->format('d M Y') }}</p>
                @if ($invoice->due_date)
                    <p class="muted" style="margin:4px 0 0;">Due: {{ $invoice->due_date->format('d M Y') }}</p>
                @endif
                @if ($invoice->paid_at)
                    <p class="muted" style="margin:4px 0 0;">Paid: {{ $invoice->paid_at->format('d M Y') }}</p>
                @endif
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Description</th>
                    <th style="text-align:center;">Qty</th>
                    <th style="text-align:right;">Unit</th>
                    <th style="text-align:right;">Total</th>
                </tr>
            </thead>
            <tbody>
                @forelse ($invoice->items as $item)
                    <tr>
                        <td>{{ $item->description ?? $item->name }}</td>
                        <td style="text-align:center;">{{ $item->quantity ?? 1 }}</td>
                        <td style="text-align:right;">MVR {{ number_format((float)($item->unit_price ?? $item->amount), 2) }}</td>
                        <td style="text-align:right;">MVR {{ number_format((float)($item->total ?? ($item->unit_price * ($item->quantity ?? 1))), 2) }}</td>
                    </tr>
                @empty
                    @if ($invoice->order)
                        @foreach ($invoice->order->items as $orderItem)
                            <tr>
                                <td>{{ $orderItem->item_name }}</td>
                                <td style="text-align:center;">{{ $orderItem->quantity }}</td>
                                <td style="text-align:right;">MVR {{ number_format((float)$orderItem->unit_price, 2) }}</td>
                                <td style="text-align:right;">MVR {{ number_format((float)$orderItem->total_price, 2) }}</td>
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
            <div class="section">
                <p class="muted">Notes</p>
                <p>{{ $invoice->notes }}</p>
            </div>
        @endif

        <div class="actions">
            <a class="btn btn-primary" href="{{ url('/invoices/' . $invoice->token . '/pdf') }}">Download PDF</a>
        </div>
    </div>
</body>
</html>
