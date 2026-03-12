<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #1C1408; background: #fff; }
  .container { max-width: 760px; margin: 0 auto; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 2px solid #D4813A; padding-bottom: 24px; }
  .brand-name { font-size: 22px; font-weight: 800; color: #D4813A; }
  .brand-sub { font-size: 11px; color: #8B7355; margin-top: 4px; }
  .invoice-meta { text-align: right; }
  .invoice-number { font-size: 18px; font-weight: 700; color: #1C1408; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }
  .badge-draft { background: #f1f3f5; color: #6c757d; }
  .badge-sent { background: #cfe2ff; color: #084298; }
  .badge-paid { background: #d1e7dd; color: #0a3622; }
  .badge-overdue { background: #f8d7da; color: #842029; }
  .badge-void { background: #e9ecef; color: #6c757d; }
  .meta-row { font-size: 11px; color: #8B7355; margin-top: 3px; }
  .parties { display: flex; gap: 40px; margin-bottom: 32px; }
  .party { flex: 1; }
  .party-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #8B7355; margin-bottom: 6px; }
  .party-name { font-size: 14px; font-weight: 700; color: #1C1408; }
  .party-sub { font-size: 12px; color: #5C4A2A; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead th { background: #FEF3E8; color: #D4813A; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 10px 12px; text-align: left; }
  thead th:last-child, thead th:nth-last-child(2) { text-align: right; }
  tbody tr { border-bottom: 1px solid #EDE4D4; }
  tbody tr:last-child { border-bottom: none; }
  tbody td { padding: 10px 12px; font-size: 13px; }
  tbody td:last-child, tbody td:nth-last-child(2) { text-align: right; }
  .totals { margin-left: auto; width: 280px; }
  .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #5C4A2A; }
  .totals-total { display: flex; justify-content: space-between; padding: 10px 0 6px; border-top: 2px solid #D4813A; font-size: 16px; font-weight: 800; color: #1C1408; margin-top: 4px; }
  .notes { margin-top: 32px; padding: 16px; background: #FFFDF9; border: 1px solid #EDE4D4; border-radius: 8px; font-size: 12px; color: #5C4A2A; line-height: 1.6; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #EDE4D4; text-align: center; font-size: 11px; color: #8B7355; }
</style>
</head>
<body>
<div class="container">

  <div class="header">
    <div>
      <div class="brand-name">Bake &amp; Grill</div>
      <div class="brand-sub">Majeedhee Magu, Malé, Maldives</div>
      <div class="brand-sub">+960 9120011 · hello@bakeandgrill.mv</div>
    </div>
    <div class="invoice-meta">
      <div class="invoice-number">{{ $invoice->invoice_number }}</div>
      <span class="badge badge-{{ $invoice->status }}">{{ strtoupper($invoice->type) }} · {{ strtoupper($invoice->status) }}</span>
      <div class="meta-row">Issued: {{ $invoice->issue_date?->format('d M Y') }}</div>
      @if($invoice->due_date)
      <div class="meta-row">Due: {{ $invoice->due_date->format('d M Y') }}</div>
      @endif
      @if($invoice->paid_at)
      <div class="meta-row">Paid: {{ $invoice->paid_at->format('d M Y') }}</div>
      @endif
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="party-label">From</div>
      <div class="party-name">Bake &amp; Grill</div>
      <div class="party-sub">Majeedhee Magu, Malé</div>
    </div>
    <div class="party">
      <div class="party-label">{{ $invoice->type === 'purchase' ? 'Supplier' : 'Bill To' }}</div>
      <div class="party-name">{{ $invoice->recipient_name ?? ($invoice->customer?->name ?? $invoice->supplier?->name ?? '—') }}</div>
      @if($invoice->recipient_phone)
      <div class="party-sub">{{ $invoice->recipient_phone }}</div>
      @endif
      @if($invoice->recipient_email)
      <div class="party-sub">{{ $invoice->recipient_email }}</div>
      @endif
      @if($invoice->recipient_address)
      <div class="party-sub">{{ $invoice->recipient_address }}</div>
      @endif
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Description</th>
        <th>Qty</th>
        <th>Unit Price</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      @foreach($invoice->items as $i => $item)
      <tr>
        <td>{{ $i + 1 }}</td>
        <td>{{ $item->description }}@if($item->unit) <span style="color:#8B7355;font-size:11px"> ({{ $item->unit }})</span>@endif</td>
        <td>{{ number_format((float)$item->quantity, 2) }}</td>
        <td>MVR {{ number_format((float)$item->unit_price, 2) }}</td>
        <td>MVR {{ number_format((float)$item->total, 2) }}</td>
      </tr>
      @endforeach
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-row"><span>Subtotal</span><span>MVR {{ number_format((float)$invoice->subtotal, 2) }}</span></div>
    @if($invoice->discount_amount > 0)
    <div class="totals-row"><span>Discount</span><span>− MVR {{ number_format((float)$invoice->discount_amount, 2) }}</span></div>
    @endif
    @if($invoice->tax_amount > 0)
    <div class="totals-row"><span>Tax ({{ number_format($invoice->tax_rate_bp / 100, 1) }}%)</span><span>MVR {{ number_format((float)$invoice->tax_amount, 2) }}</span></div>
    @endif
    <div class="totals-total"><span>Total</span><span>MVR {{ number_format((float)$invoice->total, 2) }}</span></div>
  </div>

  @if($invoice->notes || $invoice->terms)
  <div class="notes">
    @if($invoice->notes)<strong>Notes:</strong> {{ $invoice->notes }}<br>@endif
    @if($invoice->terms)<strong>Terms:</strong> {{ $invoice->terms }}@endif
  </div>
  @endif

  <div class="footer">
    Thank you for your business · Bake &amp; Grill, Malé, Maldives
  </div>

</div>
</body>
</html>
