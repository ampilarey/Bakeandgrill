import type { OfflineOrderRecord } from "./db";

const BRAND = {
  name: "Bake & Grill",
  tagline: "Fresh grills & baked favorites",
  primary: "#D4813A",
  dark: "#1C1408",
  bg: "#FFFDF9",
  border: "#EDE4D4",
  muted: "#8B7355",
  amberLight: "#FEF3E8",
};

export function buildLocalReceiptHtml(order: OfflineOrderRecord): string {
  const lines = order.items.map((it) => {
    const name = it.name ?? `Item #${it.item_id}`;
    const lineTotal = (it.unit_price * it.quantity).toFixed(2);
    return `<tr><td>${escapeHtml(name)} × ${it.quantity}</td><td style="text-align:right;font-weight:600">MVR ${lineTotal}</td></tr>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(order.local_order_number)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Plus Jakarta Sans", system-ui, sans-serif; max-width: 360px; margin: 0 auto; color: ${BRAND.dark}; background: ${BRAND.bg}; }
  .masthead { background: linear-gradient(135deg, ${BRAND.dark} 0%, #2a1a0a 100%); color: #fff; padding: 16px; border-bottom: 3px solid ${BRAND.primary}; }
  .masthead h1 { font-size: 18px; margin: 0 0 2px; font-weight: 800; letter-spacing: -0.02em; }
  .masthead .tagline { font-size: 10px; color: #F0A96A; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
  .masthead .doc { margin-top: 10px; font-size: 11px; color: #F0A96A; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
  .masthead .num { font-size: 15px; font-weight: 800; color: #fff; margin-top: 2px; }
  .body { padding: 16px; }
  .banner { background: ${BRAND.amberLight}; color: #92400e; border: 1px solid #fcd34d; padding: 8px 10px; border-radius: 10px; font-size: 11px; font-weight: 600; margin-bottom: 12px; }
  .muted { color: ${BRAND.muted}; font-size: 12px; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
  thead th { background: ${BRAND.amberLight}; color: ${BRAND.primary}; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; padding: 8px 6px; border-bottom: 2px solid ${BRAND.primary}; text-align: left; }
  thead th:last-child { text-align: right; }
  td { padding: 8px 6px; border-bottom: 1px solid ${BRAND.border}; vertical-align: top; }
  tbody tr:nth-child(even) td { background: rgba(254,243,232,0.45); }
  .total { display: flex; justify-content: space-between; font-weight: 800; font-size: 16px; color: ${BRAND.primary}; border-top: 2px solid ${BRAND.primary}; padding-top: 10px; margin-top: 8px; }
  .footer { text-align: center; font-size: 11px; color: ${BRAND.muted}; padding: 12px 16px 20px; border-top: 1px solid ${BRAND.border}; }
  .footer strong { color: ${BRAND.dark}; display: block; margin-bottom: 4px; }
</style></head><body>
<div class="masthead">
  <h1>${BRAND.name}</h1>
  <div class="tagline">${BRAND.tagline}</div>
  <div class="doc">Offline receipt</div>
  <div class="num">${escapeHtml(order.local_order_number)}</div>
</div>
<div class="body">
<div class="banner">OFFLINE — will sync when internet returns</div>
<div class="muted">${escapeHtml(new Date(order.created_at_local).toLocaleString())}</div>
<div class="muted">Payment: ${escapeHtml(order.payment.method)} · MVR ${order.payment.amount.toFixed(2)}</div>
<table><thead><tr><th>Item</th><th style="text-align:right">MVR</th></tr></thead><tbody>${lines}</tbody></table>
<div class="total"><span>Total</span><span>MVR ${order.totals.total.toFixed(2)}</span></div>
</div>
<div class="footer"><strong>${BRAND.name}</strong>Thank you for your order</div>
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
