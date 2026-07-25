import { describe, expect, it } from 'vitest';
import { categoryLooksLikeCatering, isMenuCateringItem } from './menuCatering';

describe('menuCatering helpers', () => {
  it('matches catering/event category names', () => {
    expect(categoryLooksLikeCatering('Catering')).toBe(true);
    expect(categoryLooksLikeCatering('Event catering')).toBe(true);
    expect(categoryLooksLikeCatering('Events')).toBe(true);
    expect(categoryLooksLikeCatering('Drinks')).toBe(false);
  });

  it('resolves via parent catering category', () => {
    const categories = [
      { id: 14, name: 'Catering', parent_id: null },
      { id: 15, name: 'Platters', parent_id: 14 },
    ];
    expect(isMenuCateringItem({ category_id: 15, is_catering: false }, categories)).toBe(true);
  });
});
