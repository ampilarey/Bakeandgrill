import { describe, expect, it } from 'vitest';
import { EMPTY_INVENTORY_FILTERS, NO_CATEGORY, activeFilterCount, filterInventory, parseNumberFilter } from './inventoryFilter';

/*
 * Owner, 2026-09-13: "in inventory add sort and filter option to heading."
 * The boxes under the headings. Tested apart from the page for the same
 * reason the sort is: the table and the phone cards both draw this list.
 */
const rows = [
  { name: 'Water',  sku: 'WTR-1', quantity_on_hand: 15,  reorder_level: 20,   category: { name: 'Drinks' }, usage_per_day: 5, bought_per_day: 4 },
  { name: 'Rice',   sku: 'RCE-1', quantity_on_hand: 240, reorder_level: 50,   category: { name: 'Dry' },    usage_per_day: 2, bought_per_day: 10 },
  { name: 'Gas',    sku: null,    quantity_on_hand: 2,   reorder_level: null, category: null,               usage_per_day: 0, bought_per_day: 0.1 },
  { name: 'Aprons', sku: 'APR-9', quantity_on_hand: 9,   reorder_level: null, category: { name: 'dry' },    usage_per_day: 0, bought_per_day: 0 },
];
const names = (list: typeof rows) => list.map((r) => r.name);
const only = (f: Partial<typeof EMPTY_INVENTORY_FILTERS>) => ({ ...EMPTY_INVENTORY_FILTERS, ...f });

describe('the number expression under a heading', () => {
  it('reads less-than, at-most, more-than, at-least and equals', () => {
    expect(parseNumberFilter('<20')!(15)).toBe(true);
    expect(parseNumberFilter('<20')!(20)).toBe(false);
    expect(parseNumberFilter('<=20')!(20)).toBe(true);
    expect(parseNumberFilter('>5')!(5)).toBe(false);
    expect(parseNumberFilter('>=5')!(5)).toBe(true);
    expect(parseNumberFilter('=9')!(9)).toBe(true);
    expect(parseNumberFilter('9')!(9.0000001)).toBe(true);
  });

  it('reads a range either way round, inclusive', () => {
    expect(parseNumberFilter('10-50')!(10)).toBe(true);
    expect(parseNumberFilter('50-10')!(50)).toBe(true);
    expect(parseNumberFilter('10-50')!(51)).toBe(false);
  });

  it('lets "none" find the blanks, and never matches a blank otherwise', () => {
    expect(parseNumberFilter('none')!(null)).toBe(true);
    expect(parseNumberFilter('none')!(3)).toBe(false);
    expect(parseNumberFilter('<20')!(null)).toBe(false);
  });

  it('is no filter at all while half-typed, so the list does not blank out under the cursor', () => {
    expect(parseNumberFilter('')).toBeNull();
    expect(parseNumberFilter('<')).toBeNull();
    expect(parseNumberFilter('abc')).toBeNull();
  });
});

describe('filterInventory', () => {
  it('leaves everything alone with nothing typed', () => {
    expect(names(filterInventory(rows, EMPTY_INVENTORY_FILTERS))).toEqual(names(rows));
  });

  it('matches SKU anywhere, ignoring case, and skips the ones without one', () => {
    expect(names(filterInventory(rows, only({ sku: 'r-' })))).toEqual(['Water', 'Aprons']);
  });

  it('picks a category however it is capitalised, and can pick the uncategorised', () => {
    expect(names(filterInventory(rows, only({ category: 'Dry' })))).toEqual(['Rice', 'Aprons']);
    expect(names(filterInventory(rows, only({ category: NO_CATEGORY })))).toEqual(['Gas']);
  });

  it('splits low stock from OK the way the badge does', () => {
    // Water is at 15 against a level of 20; nothing else has a level it is under.
    expect(names(filterInventory(rows, only({ status: 'low' })))).toEqual(['Water']);
    expect(names(filterInventory(rows, only({ status: 'ok' })))).toEqual(['Rice', 'Gas', 'Aprons']);
  });

  it('narrows on hand, the per-day rate and the reorder level', () => {
    expect(names(filterInventory(rows, only({ on_hand: '<10' })))).toEqual(['Gas', 'Aprons']);
    // The rate stands on usage first, buying second — Gas is bought 0.1 a day.
    expect(names(filterInventory(rows, only({ per_day: '>=1' })))).toEqual(['Water', 'Rice']);
    expect(names(filterInventory(rows, only({ per_day: 'none' })))).toEqual(['Aprons']);
    expect(names(filterInventory(rows, only({ reorder_level: 'none' })))).toEqual(['Gas', 'Aprons']);
  });

  it('stacks: every box has to agree', () => {
    expect(names(filterInventory(rows, only({ category: 'Dry', on_hand: '>100' })))).toEqual(['Rice']);
  });

  it('counts the boxes doing something', () => {
    expect(activeFilterCount(EMPTY_INVENTORY_FILTERS)).toBe(0);
    expect(activeFilterCount(only({ sku: 'x', status: 'low', on_hand: '  ' }))).toBe(2);
  });
});
