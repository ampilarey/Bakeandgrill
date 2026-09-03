import { code128Svg } from './code128';

/**
 * Printable shelf labels for stock items (2026-09-03).
 *
 * Receiving by scan matches a purchase line by supplier barcode, then SKU.
 * Items with no supplier barcode get a Code 128 of their SKU so the packet
 * or shelf edge can be scanned like everything else. The sheet opens in a
 * new window and prints as a grid of labels; browsers offer "fit to page",
 * and the label size below suits A4 sheets of 3 × 8 address labels.
 */
export interface LabelItem {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit?: string;
}

export interface LabelPlan {
  /** Items that get a label, with the code that will be printed. */
  labels: Array<{ id: number; name: string; code: string; source: 'barcode' | 'sku'; unit?: string }>;
  /** Items skipped because they have neither a barcode nor a SKU. */
  skipped: Array<{ id: number; name: string }>;
}

export function planShelfLabels(items: LabelItem[]): LabelPlan {
  const plan: LabelPlan = { labels: [], skipped: [] };
  for (const item of items) {
    const barcode = item.barcode?.trim() ?? '';
    const sku = item.sku?.trim() ?? '';
    if (barcode !== '') {
      plan.labels.push({ id: item.id, name: item.name, code: barcode, source: 'barcode', unit: item.unit });
    } else if (sku !== '') {
      plan.labels.push({ id: item.id, name: item.name, code: sku, source: 'sku', unit: item.unit });
    } else {
      plan.skipped.push({ id: item.id, name: item.name });
    }
  }
  return plan;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Full HTML document for the print window. Pure string; no DOM needed, so it is unit-tested. */
export function shelfLabelsHtml(plan: LabelPlan, title = 'Shelf labels'): string {
  const cells = plan.labels
    .map((l) => {
      let svg: string;
      try {
        svg = code128Svg(l.code, { module: 2, height: 44, quiet: 10 });
      } catch {
        return `<div class="label label--bad"><div class="name">${esc(l.name)}</div><div class="code">Cannot encode "${esc(l.code)}"</div></div>`;
      }
      return (
        `<div class="label">` +
        `<div class="name">${esc(l.name)}</div>` +
        `<div class="bars">${svg}</div>` +
        `<div class="code">${esc(l.code)}${l.source === 'sku' ? ' <span class="tag">SKU</span>' : ''}${l.unit ? ` <span class="tag">${esc(l.unit)}</span>` : ''}</div>` +
        `</div>`
      );
    })
    .join('');

  const skipped = plan.skipped.length
    ? `<p class="skipped no-print">Not printed (no barcode or SKU): ${plan.skipped.map((s) => esc(s.name)).join(', ')}</p>`
    : '';

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #000; background: #fff; }
  .toolbar { padding: 12px 16px; border-bottom: 1px solid #ddd; display: flex; gap: 12px; align-items: center; }
  .toolbar button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 1px solid #999; background: #f5f5f5; cursor: pointer; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; padding: 6mm; }
  .label { border: 1px dashed #bbb; border-radius: 4px; padding: 4mm 3mm; text-align: center; break-inside: avoid; height: 34mm; display: flex; flex-direction: column; justify-content: center; gap: 2mm; overflow: hidden; }
  .label--bad { color: #900; }
  .name { font-size: 12px; font-weight: 700; line-height: 1.2; max-height: 2.4em; overflow: hidden; }
  .bars svg { max-width: 100%; height: 40px; }
  .code { font-size: 11px; font-family: ui-monospace, Menlo, Consolas, monospace; letter-spacing: 0.06em; }
  .tag { font-family: inherit; font-size: 9px; padding: 1px 4px; border: 1px solid #999; border-radius: 3px; letter-spacing: 0; }
  .skipped { padding: 8px 16px; font-size: 12px; color: #666; }
  @media print { .no-print { display: none !important; } .label { border-color: transparent; } .grid { padding: 0; } }
  </style></head><body>
  <div class="toolbar no-print"><strong>${plan.labels.length} label${plan.labels.length === 1 ? '' : 's'}</strong><button type="button" onclick="window.print()">Print</button><span>Use A4 sheets of 3 × 8 labels, or plain paper and scissors.</span></div>
  ${skipped}
  <div class="grid">${cells}</div>
  </body></html>`;
}
