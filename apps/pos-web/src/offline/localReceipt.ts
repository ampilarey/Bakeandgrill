import type { OfflineOrderRecord } from "./db";

export function buildLocalReceiptHtml(order: OfflineOrderRecord): string {
  const lines = order.items.map((it) => {
    const name = it.name ?? `Item #${it.item_id}`;
    const lineTotal = (it.unit_price * it.quantity).toFixed(2);
    return `<tr><td>${escapeHtml(name)} × ${it.quantity}</td><td style="text-align:right">MVR ${lineTotal}</td></tr>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(order.local_order_number)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 320px; margin: 24px auto; color: #0f172a; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .muted { color: #64748b; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
  td { padding: 4px 0; vertical-align: top; }
  .total { font-weight: 700; font-size: 16px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  .banner { background: #fef3c7; color: #92400e; padding: 8px; border-radius: 6px; font-size: 12px; margin-bottom: 12px; }
</style></head><body>
<div class="banner">OFFLINE RECEIPT — will sync when internet returns</div>
<h1>${escapeHtml(order.local_order_number)}</h1>
<div class="muted">${escapeHtml(new Date(order.created_at_local).toLocaleString())}</div>
<div class="muted">Payment: ${escapeHtml(order.payment.method)} · MVR ${order.payment.amount.toFixed(2)}</div>
<table>${lines}</table>
<div class="total">Total: MVR ${order.totals.total.toFixed(2)}</div>
<script>window.onload = () => window.print();</script>
</body></html>`;
}

export function openLocalReceipt(order: OfflineOrderRecord): void {
  const html = buildLocalReceiptHtml(order);
  const w = window.open("", "_blank", "width=400,height=600");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
