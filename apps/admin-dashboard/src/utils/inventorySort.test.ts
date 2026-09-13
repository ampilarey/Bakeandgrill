import { describe, expect, it } from 'vitest';
import { needsReorderSoon, sortInventory, groupInventoryByCategory } from './inventorySort';

/*
 * The stock list's ordering rules. The point of testing them apart from the
 * page: the table and the phone cards both draw this list, and a rule that
 * quietly differed between them would be the worst kind of bug to notice.
 */
const rows = [
  { name: 'Water',  quantity_on_hand: 15, reorder_level: 20,  category: { name: 'Drinks' }, usage_per_day: 5,  bought_per_day: 4, days_left: 3 },
  { name: 'Rice',   quantity_on_hand: 240, reorder_level: 50, category: { name: 'Dry' },    usage_per_day: 2,  bought_per_day: 10, days_left: 120 },
  { name: 'Gas',    quantity_on_hand: 2,  reorder_level: null, category: null,               usage_per_day: 0,  bought_per_day: 0.1, days_left: 20 },
  { name: 'Aprons', quantity_on_hand: 9,  reorder_level: null, category: { name: 'Dry' },    usage_per_day: 0,  bought_per_day: 0,   days_left: null },
];
const names = (list: typeof rows) => list.map((r) => r.name);

describe('sortInventory', () => {
  it('sorts by name without caring about case', () => {
    expect(names(sortInventory(rows, 'name'))).toEqual(['Aprons', 'Gas', 'Rice', 'Water']);
  });

  it('sorts Z–A as the exact mirror of A–Z', () => {
    expect(names(sortInventory(rows, 'name_desc'))).toEqual(['Water', 'Rice', 'Gas', 'Aprons']);
  });

  it('puts low stock first, then alphabetical', () => {
    expect(names(sortInventory(rows, 'low_first'))).toEqual(['Water', 'Aprons', 'Gas', 'Rice']);
  });

  it('runs-out-soonest opens with the item nearest empty and sinks the unknowns', () => {
    // Aprons have no rate, so no days-left figure — they must not lead.
    expect(names(sortInventory(rows, 'days_left'))).toEqual(['Water', 'Gas', 'Rice', 'Aprons']);
  });

  it('most-used stands on tracked usage first and the buying rate second', () => {
    // Gas has no tracked usage but IS bought 0.1 a day; Aprons have neither.
    expect(names(sortInventory(rows, 'usage'))).toEqual(['Water', 'Rice', 'Gas', 'Aprons']);
  });

  it('least on hand is a plain count', () => {
    expect(names(sortInventory(rows, 'on_hand'))).toEqual(['Gas', 'Aprons', 'Water', 'Rice']);
  });

  it('groups by category with the uncategorised last', () => {
    expect(names(sortInventory(rows, 'category'))).toEqual(['Water', 'Aprons', 'Rice', 'Gas']);
  });

  it('the buying list is whatever is low OR runs out within the week', () => {
    // Water: under its level and 3 days left. Gas: no level, 20 days. Rice:
    // 120 days. Aprons: nothing known — not on the list.
    expect(names(rows.filter(needsReorderSoon))).toEqual(['Water']);
    expect(needsReorderSoon({ name: 'Milk', quantity_on_hand: 50, reorder_level: 10, days_left: 2 })).toBe(true);
    expect(needsReorderSoon({ name: 'Milk', quantity_on_hand: 5, reorder_level: 10, days_left: null })).toBe(true);
    expect(needsReorderSoon({ name: 'Milk', quantity_on_hand: 50, reorder_level: null, days_left: 8 })).toBe(false);
  });

  it('never mutates what it was given', () => {
    const before = names(rows);
    sortInventory(rows, 'on_hand');
    expect(names(rows)).toEqual(before);
  });
});

describe('groupInventoryByCategory', () => {
  const item = (name: string, category: string | null) => ({
    name,
    quantity_on_hand: 1,
    reorder_level: null,
    category: category === null ? null : { name: category },
  });

  it('puts like with like and names each group', () => {
    const groups = groupInventoryByCategory([
      item('Flour', 'Dry store'),
      item('Milk', 'Chilled'),
      item('Sugar', 'Dry store'),
    ]);

    expect(groups.map((g) => [g.name, g.items.map((i) => i.name)])).toEqual([
      ['Chilled', ['Milk']],
      ['Dry store', ['Flour', 'Sugar']],
    ]);
  });

  it('keeps the order the sort gave, inside each group', () => {
    const groups = groupInventoryByCategory([
      item('Sugar', 'Dry store'),
      item('Flour', 'Dry store'),
    ]);
    expect(groups[0].items.map((i) => i.name)).toEqual(['Sugar', 'Flour']);
  });

  it('collects the unfiled ones at the end', () => {
    const groups = groupInventoryByCategory([
      item('Odd thing', null),
      item('Milk', 'Chilled'),
      item('Blank', '   '),
    ]);

    expect(groups.map((g) => g.name)).toEqual(['Chilled', 'No category']);
    expect(groups[1].items.map((i) => i.name)).toEqual(['Odd thing', 'Blank']);
  });

  it('treats one category named two ways as one group', () => {
    const groups = groupInventoryByCategory([item('A', 'Chilled'), item('B', 'chilled')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
  });

  it('has nothing to group when the list is empty', () => {
    expect(groupInventoryByCategory([])).toEqual([]);
  });
});

/*
 * Owner, 2026-09-13: "in inventory add sort and filter option to heading."
 * Each heading is a sort control; these are the ways it can go.
 */
import { columnSortState, nextColumnSort } from './inventorySort';

const skus = [
  { ...rows[0], sku: 'WTR-1' },
  { ...rows[1], sku: 'RCE-1' },
  { ...rows[2], sku: null },
  { ...rows[3], sku: 'APR-9' },
];

describe('sorting from the headings', () => {
  it('sorts by SKU either way and keeps the ones without one at the bottom', () => {
    expect(names(sortInventory(skus, 'sku'))).toEqual(['Aprons', 'Rice', 'Water', 'Gas']);
    expect(names(sortInventory(skus, 'sku_desc'))).toEqual(['Water', 'Rice', 'Aprons', 'Gas']);
  });

  it('sorts by category the other way with the uncategorised still last', () => {
    expect(names(sortInventory(rows, 'category_desc'))).toEqual(['Aprons', 'Rice', 'Water', 'Gas']);
  });

  it('sorts most on hand, OK first, least used and reorder level both ways', () => {
    expect(names(sortInventory(rows, 'on_hand_desc'))).toEqual(['Rice', 'Water', 'Aprons', 'Gas']);
    expect(names(sortInventory(rows, 'ok_first'))).toEqual(['Aprons', 'Gas', 'Rice', 'Water']);
    // Least used still sinks the ones with no rate at all.
    expect(names(sortInventory(rows, 'usage_asc'))).toEqual(['Gas', 'Rice', 'Water', 'Aprons']);
    expect(names(sortInventory(rows, 'reorder_level'))).toEqual(['Water', 'Rice', 'Aprons', 'Gas']);
    expect(names(sortInventory(rows, 'reorder_level_desc'))).toEqual(['Rice', 'Water', 'Aprons', 'Gas']);
  });

  it('tapping a heading sorts by it, tapping again turns it round', () => {
    expect(nextColumnSort('name', 'on_hand')).toBe('on_hand');
    expect(nextColumnSort('on_hand', 'on_hand')).toBe('on_hand_desc');
    expect(nextColumnSort('on_hand_desc', 'on_hand')).toBe('on_hand');
  });

  it('knows which heading carries the arrow, and which way', () => {
    expect(columnSortState('usage', 'per_day')).toBe('asc');
    expect(columnSortState('usage_asc', 'per_day')).toBe('desc');
    expect(columnSortState('usage', 'name')).toBeNull();
  });
});
