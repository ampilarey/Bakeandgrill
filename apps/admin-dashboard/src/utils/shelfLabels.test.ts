import { describe, expect, it } from 'vitest';
import { planShelfLabels, shelfLabelsHtml } from './shelfLabels';

const items = [
  { id: 1, name: 'Flour 25kg', sku: 'FLR-25', barcode: '8801234567890', unit: 'kg' },
  { id: 2, name: 'House sourdough starter', sku: 'SRD-1', barcode: null, unit: 'kg' },
  { id: 3, name: 'Mystery bag', sku: '', barcode: '   ' },
];

describe('planShelfLabels', () => {
  it('prefers the supplier barcode, falls back to SKU, and names what it skips', () => {
    const plan = planShelfLabels(items);
    expect(plan.labels.map((l) => [l.code, l.source])).toEqual([
      ['8801234567890', 'barcode'],
      ['SRD-1', 'sku'],
    ]);
    expect(plan.skipped).toEqual([{ id: 3, name: 'Mystery bag' }]);
  });
});

describe('shelfLabelsHtml', () => {
  it('prints one barcode per label, tags SKU codes, escapes names, and lists the skipped', () => {
    const html = shelfLabelsHtml(planShelfLabels([...items, { id: 4, name: 'A <b>bold</b> & co', sku: 'X-1', barcode: null }]));
    expect(html.match(/<svg /g)?.length).toBe(3);
    expect(html).toContain('aria-label="8801234567890"');
    expect(html).toContain('SRD-1 <span class="tag">SKU</span>');
    expect(html).not.toContain('8801234567890 <span class="tag">SKU</span>');
    expect(html).toContain('A &lt;b&gt;bold&lt;/b&gt; &amp; co');
    expect(html).toContain('Not printed (no barcode or SKU): Mystery bag');
    expect(html).toContain('<strong>3 labels</strong>');
  });

  it('keeps an unencodable code on the sheet as a visible error rather than dropping it', () => {
    const html = shelfLabelsHtml(planShelfLabels([{ id: 9, name: 'Tab', sku: 'A\tB', barcode: null }]));
    expect(html).toContain('label--bad');
    expect(html).not.toContain('<svg ');
  });
});
