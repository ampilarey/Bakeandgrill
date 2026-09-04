import { describe, expect, it } from 'vitest';
import { CSV_COLUMNS, csvToDrafts, itemsToCsv, parseCsv } from './menuCsv';
import type { MenuCategory, MenuItem } from '../../api';

/**
 * "Also show in" survives a spreadsheet round-trip.
 *
 * Owner, 2026-09-04: the file carried the home category but not the extra
 * placements, so exporting the menu, editing it and importing it back gave a
 * file that could never restore what it had shown on screen.
 */
const categories = [
  { id: 1, name: 'Kulhi Hedhikaa' },
  { id: 2, name: 'Evening Tea' },
  { id: 3, name: 'Snacks' },
] as unknown as MenuCategory[];

/** Complete enough that an untouched export reads back as no change at all. */
const bajiya = {
  id: 10,
  name: 'Bajiya',
  name_dv: '',
  category_id: 1,
  category: { id: 1, name: 'Kulhi Hedhikaa' },
  base_price: 5,
  cost: null,
  sku: null,
  barcode: null,
  tax_code: 'standard_8',
  track_stock: false,
  stock_quantity: null,
  is_available: true,
  is_active: true,
  sort_order: 0,
  extra_category_ids: [2, 3],
  variants: [],
} as unknown as MenuItem;

const importOf = (csv: string, items: MenuItem[]) => {
  const { header, rows } = parseCsv(csv);

  return csvToDrafts(rows, header, items, true);
};

describe('menu CSV — also show in', () => {
  it('carries both a readable name list and the writable ids', () => {
    const csv = itemsToCsv([bajiya], true, categories);

    expect(CSV_COLUMNS).toContain('also_in');
    expect(CSV_COLUMNS).toContain('also_in_ids');
    expect(csv).toContain('Evening Tea; Snacks');
    expect(csv).toContain('2;3');
  });

  it('reads an untouched export back as no change at all', () => {
    const csv = itemsToCsv([bajiya], true, categories);

    expect(importOf(csv, [bajiya]).changedRows).toBe(0);
  });

  it('writes a changed placement list', () => {
    const csv = itemsToCsv([bajiya], true, categories).replace('2;3', '3');
    const result = importOf(csv, [bajiya]);

    expect(result.changedRows).toBe(1);
    expect(result.drafts[10]).toEqual({ extra_category_ids: [3] });
  });

  it('treats an emptied cell as clearing the placements', () => {
    // The only way a spreadsheet can say "not in that section any more".
    const csv = itemsToCsv([bajiya], true, categories).replace(',2;3,', ',,');
    const result = importOf(csv, [bajiya]);

    expect(result.drafts[10]).toEqual({ extra_category_ids: [] });
  });

  it('does not read a reordered list as an edit', () => {
    const csv = itemsToCsv([bajiya], true, categories).replace('2;3', '3;2');

    expect(importOf(csv, [bajiya]).changedRows).toBe(0);
  });

  it('ignores the readable name column on import', () => {
    // Renaming a section in the sheet must not try to re-file the dish.
    const csv = itemsToCsv([bajiya], true, categories).replace('Evening Tea; Snacks', 'Anything At All');

    expect(importOf(csv, [bajiya]).changedRows).toBe(0);
  });

  it('writes an unknown category as its id so the file stays complete', () => {
    // The grid may be filtered to one category; the others are still real.
    const csv = itemsToCsv([bajiya], true, [categories[0]]);

    expect(csv).toContain('#2; #3');
    expect(csv).toContain('2;3');
  });
});
