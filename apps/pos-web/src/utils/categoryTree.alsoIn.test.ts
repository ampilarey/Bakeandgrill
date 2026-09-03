import { describe, expect, it } from 'vitest';

import { itemsForCategory } from './categoryTree';

/**
 * Owner, 2026-09-03: "Bajiya is Hedhikaa → Kulhi Hedhikaa, but it's an
 * evening tea item, so can it be in that too?" An item keeps one home
 * category and can also be listed under others; the till shows it under
 * each without a second copy of the item.
 */
const categories = [
  { id: 1, name: 'Hedhikaa', parent_id: null },
  { id: 2, name: 'Kulhi Hedhikaa', parent_id: 1 },
  { id: 3, name: 'Evening Tea', parent_id: null },
  { id: 4, name: 'Drinks', parent_id: null },
];

const items = [
  { id: 10, name: 'Bajiya', category_id: 2, extra_category_ids: [3] },
  { id: 11, name: 'Tea', category_id: 4, extra_category_ids: [3] },
  { id: 12, name: 'Gulha', category_id: 2 },
];

const names = (rows: ReadonlyArray<{ name: string }>) => rows.map((r) => r.name).sort();

describe('itemsForCategory with "also show in"', () => {
  it('lists an item under its home and under each extra category', () => {
    expect(names(itemsForCategory(items, categories, 2))).toEqual(['Bajiya', 'Gulha']);
    expect(names(itemsForCategory(items, categories, 1))).toEqual(['Bajiya', 'Gulha']);
    expect(names(itemsForCategory(items, categories, 3))).toEqual(['Bajiya', 'Tea']);
    expect(names(itemsForCategory(items, categories, 4))).toEqual(['Tea']);
  });

  it('never returns the same item twice for one selection', () => {
    const rows = itemsForCategory(items, categories, 3);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });
});
