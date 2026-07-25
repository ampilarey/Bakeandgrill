import { describe, expect, it } from 'vitest';
import type { MenuItem } from '@shared/types';
import {
  categoryLooksLikeCatering,
  isMenuCateringItem,
  mergeCateringSectionItems,
} from '../utils/menuCatering';

describe('Online Event & catering menu section', () => {
  const categories = [
    { id: 1, name: 'Burgers', parent_id: null },
    { id: 2, name: 'Trays', parent_id: null },
    { id: 14, name: 'Catering', parent_id: null },
    { id: 15, name: 'Platters', parent_id: 14 },
  ];

  const items = [
    { id: 1, name: 'Burger', base_price: 40, category_id: 1, is_catering: false },
    { id: 2, name: 'Tray', base_price: 450, category_id: 2, is_catering: true },
    { id: 65, name: 'C test', base_price: 6, category_id: 14, is_catering: false },
    { id: 66, name: 'Office box', base_price: 120, category_id: 15, is_catering: false },
  ] as MenuItem[];

  it('includes channel-flagged catering items', () => {
    expect(items.filter((i) => isMenuCateringItem(i, categories)).map((i) => i.id)).toEqual([
      2, 65, 66,
    ]);
  });

  it('includes items filed under a Catering category even without the channel flag', () => {
    expect(isMenuCateringItem(items[2], categories)).toBe(true);
    expect(categoryLooksLikeCatering('Catering')).toBe(true);
    expect(categoryLooksLikeCatering('Events')).toBe(true);
    expect(categoryLooksLikeCatering('Burgers')).toBe(false);
  });

  it('keeps catering items out of regular category grids', () => {
    const regular = items.filter(
      (i) => i.category_id === 14 && !isMenuCateringItem(i, categories),
    );
    expect(regular).toHaveLength(0);
  });

  it('merges catering-channel listing with immediate-channel matches', () => {
    const listing = [
      { id: 99, name: 'Buffet package', base_price: 900, category_id: 14, is_catering: true },
    ] as MenuItem[];
    const merged = mergeCateringSectionItems(
      items,
      listing,
      (item) => isMenuCateringItem(item, categories),
    );
    expect(merged.map((i) => i.id).sort((a, b) => a - b)).toEqual([2, 65, 66, 99]);
  });

  it('hides the section when none exist', () => {
    const none = items.filter((i) => i.category_id === 1);
    expect(none.filter((i) => isMenuCateringItem(i, categories))).toHaveLength(0);
  });
});
