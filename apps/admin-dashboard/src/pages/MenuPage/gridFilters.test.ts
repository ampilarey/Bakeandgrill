import { describe, expect, it } from 'vitest';
import type { MenuItem } from '../../api';
import {
  EMPTY_FILTERS,
  activeFilterCount,
  applyFilters,
  applySort,
  nextSort,
  visibleRows,
} from './gridFilters';

function item(over: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 1,
    name: 'Bajiya',
    base_price: 10,
    is_available: true,
    is_active: true,
    category_id: 1,
    category: { id: 1, name: 'Snacks' },
    tax_code: 'standard_8',
    sort_order: 0,
    variants: [],
    ...over,
  } as MenuItem;
}

const menu = [
  item({ id: 1, name: 'Bajiya', name_dv: 'ބަޖިޔާ', base_price: 10, sku: 'BAJ-1', sort_order: 2 }),
  item({ id: 2, name: 'Gulha', base_price: 20, category_id: 2, category: { id: 2, name: 'Grill' }, sort_order: 1, is_available: false }),
  item({
    id: 3, name: 'Beetle leaf', base_price: 30, is_active: false, tax_code: 'exempt', sort_order: 3,
    track_stock: true, stock_quantity: 2, low_stock_threshold: 5,
    variants: [{ id: 30, name: 'Half', price: 12, is_active: true }],
  }),
];

describe('search', () => {
  it('matches the English name', () => {
    expect(applyFilters(menu, { ...EMPTY_FILTERS, search: 'gulha' }).map((i) => i.id)).toEqual([2]);
  });

  it('matches the Dhivehi name', () => {
    expect(applyFilters(menu, { ...EMPTY_FILTERS, search: 'ބަޖިޔާ' }).map((i) => i.id)).toEqual([1]);
  });

  it('matches SKU and category', () => {
    expect(applyFilters(menu, { ...EMPTY_FILTERS, search: 'baj-1' }).map((i) => i.id)).toEqual([1]);
    expect(applyFilters(menu, { ...EMPTY_FILTERS, search: 'grill' }).map((i) => i.id)).toEqual([2]);
  });

  it('finds a dish by one of its size names', () => {
    // Searching "half" should surface the dish that has a Half, not nothing.
    expect(applyFilters(menu, { ...EMPTY_FILTERS, search: 'half' }).map((i) => i.id)).toEqual([3]);
  });

  it('ignores surrounding whitespace and case', () => {
    expect(applyFilters(menu, { ...EMPTY_FILTERS, search: '  BAJIYA ' }).map((i) => i.id)).toEqual([1]);
  });
});

describe('filters', () => {
  it('filters by category, GST, availability and status', () => {
    expect(applyFilters(menu, { ...EMPTY_FILTERS, categoryId: 2 }).map((i) => i.id)).toEqual([2]);
    expect(applyFilters(menu, { ...EMPTY_FILTERS, taxCode: 'exempt' }).map((i) => i.id)).toEqual([3]);
    expect(applyFilters(menu, { ...EMPTY_FILTERS, availability: 'sold_out' }).map((i) => i.id)).toEqual([2]);
    expect(applyFilters(menu, { ...EMPTY_FILTERS, status: 'hidden' }).map((i) => i.id)).toEqual([3]);
  });

  it('filters by whether an item has sizes', () => {
    expect(applyFilters(menu, { ...EMPTY_FILTERS, sizes: 'with' }).map((i) => i.id)).toEqual([3]);
    expect(applyFilters(menu, { ...EMPTY_FILTERS, sizes: 'without' }).map((i) => i.id)).toEqual([1, 2]);
  });

  it('finds low and out-of-stock items only among tracked ones', () => {
    expect(applyFilters(menu, { ...EMPTY_FILTERS, stock: 'low' }).map((i) => i.id)).toEqual([3]);
    expect(applyFilters(menu, { ...EMPTY_FILTERS, stock: 'tracked' }).map((i) => i.id)).toEqual([3]);
    expect(applyFilters(menu, { ...EMPTY_FILTERS, stock: 'untracked' }).map((i) => i.id)).toEqual([1, 2]);
    expect(applyFilters(menu, { ...EMPTY_FILTERS, stock: 'out' })).toEqual([]);
  });

  it('filters by a price range, inclusive at both ends', () => {
    expect(applyFilters(menu, { ...EMPTY_FILTERS, minPrice: '20' }).map((i) => i.id)).toEqual([2, 3]);
    expect(applyFilters(menu, { ...EMPTY_FILTERS, maxPrice: '20' }).map((i) => i.id)).toEqual([1, 2]);
    expect(applyFilters(menu, { ...EMPTY_FILTERS, minPrice: '20', maxPrice: '20' }).map((i) => i.id)).toEqual([2]);
  });

  it('combines filters rather than replacing them', () => {
    const rows = applyFilters(menu, { ...EMPTY_FILTERS, search: 'a', minPrice: '15' });

    expect(rows.map((i) => i.id)).toEqual([2, 3]);
  });

  it('counts how many filters are on, for the button badge', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, search: 'x', stock: 'low' })).toBe(2);
    // Whitespace alone is not a filter.
    expect(activeFilterCount({ ...EMPTY_FILTERS, search: '   ' })).toBe(0);
  });
});

describe('sorting', () => {
  it('falls back to menu order when nothing is chosen', () => {
    expect(applySort(menu, null).map((i) => i.id)).toEqual([2, 1, 3]);
  });

  it('sorts by price numerically, not as text', () => {
    const wide = [item({ id: 1, base_price: 9 }), item({ id: 2, base_price: 100 })];

    expect(applySort(wide, { key: 'price', direction: 'asc' }).map((i) => i.id)).toEqual([1, 2]);
    expect(applySort(wide, { key: 'price', direction: 'desc' }).map((i) => i.id)).toEqual([2, 1]);
  });

  it('sorts by name and by category', () => {
    expect(applySort(menu, { key: 'name', direction: 'asc' }).map((i) => i.name))
      .toEqual(['Bajiya', 'Beetle leaf', 'Gulha']);
    expect(applySort(menu, { key: 'category', direction: 'asc' }).map((i) => i.id)).toEqual([2, 1, 3]);
  });

  it('does not mutate the array it was given', () => {
    const original = menu.map((i) => i.id);
    applySort(menu, { key: 'name', direction: 'desc' });

    expect(menu.map((i) => i.id)).toEqual(original);
  });

  it('cycles a header through ascending, descending and off', () => {
    expect(nextSort(null, 'price')).toEqual({ key: 'price', direction: 'asc' });
    expect(nextSort({ key: 'price', direction: 'asc' }, 'price')).toEqual({ key: 'price', direction: 'desc' });
    expect(nextSort({ key: 'price', direction: 'desc' }, 'price')).toBeNull();
    // A different header starts its own cycle.
    expect(nextSort({ key: 'price', direction: 'desc' }, 'name')).toEqual({ key: 'name', direction: 'asc' });
  });
});

describe('visibleRows', () => {
  it('filters first and sorts what survives', () => {
    const rows = visibleRows(menu, { ...EMPTY_FILTERS, minPrice: '15' }, { key: 'price', direction: 'desc' });

    expect(rows.map((i) => i.id)).toEqual([3, 2]);
  });
});
