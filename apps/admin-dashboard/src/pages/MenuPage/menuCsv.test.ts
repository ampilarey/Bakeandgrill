import { describe, expect, it } from 'vitest';
import type { MenuItem } from '../../api';
import { csvToDrafts, itemsToCsv, parseCsv, parseCsvLine } from './menuCsv';

function item(over: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 1,
    name: 'Bajiya',
    name_dv: 'ބަޖިޔާ',
    base_price: 10,
    cost: 4,
    sku: 'BAJ-1',
    tax_code: 'standard_8',
    track_stock: false,
    is_available: true,
    is_active: true,
    sort_order: 0,
    category_id: 3,
    category: { id: 3, name: 'Snacks' },
    variants: [],
    ...over,
  } as MenuItem;
}

const sized = item({
  id: 2,
  name: 'Beetle leaf',
  base_price: 20,
  variants: [
    { id: 10, name: 'Full', price: 20, is_active: true, sort_order: 0, consumption_factor: 1 },
    { id: 11, name: 'Half', price: 12, is_active: true, sort_order: 1, consumption_factor: 0.5 },
  ],
});

function roundTrip(items: MenuItem[], edit: (csv: string) => string, canSeeCost = true) {
  const csv = edit(itemsToCsv(items, canSeeCost));
  const { header, rows } = parseCsv(csv);

  return csvToDrafts(rows, header, items, canSeeCost);
}

describe('itemsToCsv', () => {
  it('starts with a byte-order mark so Excel does not mangle Dhivehi', () => {
    // Without it Excel reads UTF-8 as the local codepage, and a save-and-import
    // then writes the mojibake back over good names.
    const csv = itemsToCsv([item()], true);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('ބަޖިޔާ');
  });

  it('writes one row per item and one per size', () => {
    const { rows } = parseCsv(itemsToCsv([sized], true));

    expect(rows.map((r) => [r.type, r.id, r.name])).toEqual([
      ['item', '2', 'Beetle leaf'],
      ['size', '10', 'Full'],
      ['size', '11', 'Half'],
    ]);
    expect(rows[1].item_id).toBe('2');
    expect(rows[2].consumption_factor).toBe('0.5');
  });

  it('leaves the cost column out entirely for anyone without recipes.manage', () => {
    const csv = itemsToCsv([item()], false);

    expect(parseCsv(csv).header).not.toContain('cost');
    expect(csv).not.toContain('4.00');
  });

  it('quotes values that would otherwise break the row', () => {
    const csv = itemsToCsv([item({ name: 'Chips, large "special"' })], true);

    expect(csv).toContain('"Chips, large ""special"""');
    expect(parseCsv(csv).rows[0].name).toBe('Chips, large "special"');
  });
});

describe('parseCsvLine', () => {
  it('honours quotes, embedded commas and doubled quotes', () => {
    expect(parseCsvLine('1,"a,b","say ""hi""",')).toEqual(['1', 'a,b', 'say "hi"', '']);
  });
});

describe('csvToDrafts', () => {
  it('finds nothing to change in an untouched export', () => {
    const result = roundTrip([item(), sized], (csv) => csv);

    expect(result.changedRows).toBe(0);
    expect(result.drafts).toEqual({});
    expect(result.variantDrafts).toEqual({});
  });

  it('picks up an edited item price', () => {
    const result = roundTrip([item()], (csv) => csv.replace('10.00', '13.50'));

    expect(result.changedRows).toBe(1);
    expect(result.drafts[1]).toEqual({ base_price: 13.5 });
  });

  it('picks up an edited size price separately from its item', () => {
    const result = roundTrip([sized], (csv) => csv.replace('12.00', '14.00'));

    expect(result.variantDrafts[11]).toEqual({ price: 14 });
    expect(result.drafts).toEqual({});
  });

  it('never creates an item from an unknown id', () => {
    // A spreadsheet round-trip is a bulk edit, not a replacement for the menu.
    const csv = itemsToCsv([item()], true) + 'item,999,,New dish,,,,50.00,,,,,,,,,\r\n';
    const { header, rows } = parseCsv(csv.replace('item,999', '999,item'));
    const result = csvToDrafts(rows, header, [item()], true);

    expect(result.unknownRows).toBe(1);
    expect(Object.keys(result.drafts)).toEqual([]);
  });

  it('skips rows with no usable id or type', () => {
    const csv = itemsToCsv([item()], true) + ',,,,,,,,,,,,,,,,\r\n';
    const { header, rows } = parseCsv(csv);

    expect(csvToDrafts(rows, header, [item()], true).malformedRows).toBe(1);
  });

  it('reports columns it will not write instead of pretending they saved', () => {
    const csv = itemsToCsv([item()], true).replace('id,type', 'id,type,description');
    const { header, rows } = parseCsv(csv);

    expect(csvToDrafts(rows, header, [item()], true).ignoredColumns).toContain('description');
  });

  it('reads yes/no, true/false and 1/0 as the same thing', () => {
    for (const value of ['no', 'NO', 'false', '0']) {
      const result = roundTrip([item()], (csv) => csv.replace(/,yes,yes,0/, `,${value},yes,0`));
      expect(result.drafts[1]).toEqual({ is_available: false });
    }
  });

  it('strips the apostrophe Excel puts in front of text cells', () => {
    const result = roundTrip([item()], (csv) => csv.replace('BAJ-1', "'BAJ-2"));

    expect(result.drafts[1]).toEqual({ sku: 'BAJ-2' });
  });

  it('ignores a GST value that is not one of the four codes', () => {
    const result = roundTrip([item()], (csv) => csv.replace('standard_8', 'VAT 20%'));

    expect(result.changedRows).toBe(0);
  });

  it('keeps cost out of the import for anyone without recipes.manage', () => {
    // The column can still be present in a file somebody else exported.
    const csv = itemsToCsv([item()], true).replace('4.00', '99.00');
    const { header, rows } = parseCsv(csv);

    const blocked = csvToDrafts(rows, header, [item()], false);
    expect(blocked.changedRows).toBe(0);

    const allowed = csvToDrafts(rows, header, [item()], true);
    expect(allowed.drafts[1]).toEqual({ cost: 99 });
  });

  it('matches by id, so a mangled name cannot retarget a row', () => {
    const result = roundTrip([item()], (csv) => csv.replace('Bajiya', 'Ba??ya'));

    // The name itself is a legitimate edit on THAT row — and only that row.
    expect(Object.keys(result.drafts)).toEqual(['1']);
    expect(result.drafts[1]).toEqual({ name: 'Ba??ya' });
  });
});
