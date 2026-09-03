/**
 * Owner, 2026-08-18, describing how the till should behave:
 *
 *   "1st row all main categories. Below that subcategories row … when main
 *    category is selected. When main category is selected without selecting
 *    subcategory, all items in the all subcategories must show."
 *
 * The last sentence is this file. A parent is a heading, not a shelf — its
 * items live on its children, so selecting it has to reach down or the grid
 * comes back empty and the pill looks broken.
 */
import { describe, expect, it } from 'vitest';

import { categoryWithDescendants, itemsForCategory } from './categoryTree';

// Food → Shorteats, Fast food.  Drinks → Hot Drinks → Espresso.  Merch: leaf.
const categories = [
  { id: 1, name: 'Food', parent_id: null },
  { id: 2, name: 'Shorteats', parent_id: 1 },
  { id: 3, name: 'Fast food', parent_id: 1 },
  { id: 4, name: 'Drinks', parent_id: null },
  { id: 5, name: 'Hot Drinks', parent_id: 4 },
  { id: 6, name: 'Espresso', parent_id: 5 },
  { id: 7, name: 'Merch', parent_id: null },
];

const items = [
  { id: 10, name: 'Bajiya', category_id: 2 },
  { id: 11, name: 'Gulha', category_id: 2 },
  { id: 12, name: 'Burger', category_id: 3 },
  { id: 13, name: 'Set menu', category_id: 1 },
  { id: 14, name: 'Latte', category_id: 6 },
  { id: 15, name: 'Mug', category_id: 7 },
  { id: 16, name: 'Uncategorised', category_id: null },
];

const names = (rows: ReadonlyArray<{ name: string }>) => rows.map((r) => r.name).sort();

describe('categoryWithDescendants', () => {
  it('includes the selection itself and everything under it', () => {
    expect([...categoryWithDescendants(categories, 1)].sort()).toEqual([1, 2, 3]);
  });

  it('reaches past one level', () => {
    // Admin exposes one level today; the walk must not assume that forever.
    expect([...categoryWithDescendants(categories, 4)].sort()).toEqual([4, 5, 6]);
  });

  it('returns just the leaf when there is nothing beneath it', () => {
    expect([...categoryWithDescendants(categories, 7)]).toEqual([7]);
    expect([...categoryWithDescendants(categories, 2)]).toEqual([2]);
  });

  it('survives a cycle in the data rather than hanging the till', () => {
    // Not reachable through admin, but a bad import or a hand-edited row
    // should not spin forever behind the counter.
    const cyclic = [
      { id: 1, parent_id: 2 },
      { id: 2, parent_id: 1 },
    ];
    expect([...categoryWithDescendants(cyclic, 1)].sort()).toEqual([1, 2]);
  });
});

describe('itemsForCategory', () => {
  it('shows every item under a parent, not just the ones filed directly on it', () => {
    // The reported fault: "when main category is selected nothing is shown".
    expect(names(itemsForCategory(items, categories, 1))).toEqual(['Bajiya', 'Burger', 'Gulha', 'Set menu']);
  });

  it('narrows to the leaf when a sub-category is picked', () => {
    expect(names(itemsForCategory(items, categories, 2))).toEqual(['Bajiya', 'Gulha']);
  });

  it('reaches a grandchild from the top', () => {
    expect(names(itemsForCategory(items, categories, 4))).toEqual(['Latte']);
  });

  it('returns everything for the All tab, uncategorised included', () => {
    expect(itemsForCategory(items, categories, null)).toHaveLength(items.length);
  });

  it('leaves uncategorised items out of every category', () => {
    for (const id of [1, 2, 4, 7]) {
      expect(names(itemsForCategory(items, categories, id))).not.toContain('Uncategorised');
    }
  });

  it('shows an empty grid for a parent whose whole branch is empty', () => {
    // A genuinely empty category is empty — the fix must not invent items.
    const empty = [{ id: 20, parent_id: null }, { id: 21, parent_id: 20 }];
    expect(itemsForCategory(items, empty, 20)).toEqual([]);
  });
});
