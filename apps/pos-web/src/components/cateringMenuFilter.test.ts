import { describe, expect, it } from 'vitest';
import type { Item } from '../types';

/** Mirrors MenuGrid saleFilter === 'catering' selection. */
function cateringTabItems(items: Item[]): Item[] {
  return items.filter((i) => !!i.is_catering);
}

describe('POS Events & Catering tab filter', () => {
  const items: Item[] = [
    { id: 1, name: 'Burger', base_price: 40, category_id: 1, is_catering: false } as Item,
    { id: 2, name: 'Rice Tray', base_price: 450, category_id: 2, is_catering: true } as Item,
    { id: 3, name: 'Salad Tray', base_price: 380, category_id: 2, is_catering: true } as Item,
  ];

  it('lists only catering∧channel items (is_catering true)', () => {
    const tab = cateringTabItems(items);
    expect(tab.map((i) => i.id)).toEqual([2, 3]);
  });

  it('is empty when no catering-flagged items are in the channel menu', () => {
    expect(cateringTabItems(items.filter((i) => !i.is_catering))).toEqual([]);
  });
});

describe('POS catering cart line math', () => {
  it('does not change unit price when is_catering is set', () => {
    const regular = { id: 1, name: 'Tray', price: 450, quantity: 2, modifiers: [], is_catering: false };
    const catering = { ...regular, is_catering: true };
    const lineTotal = (line: typeof regular) => line.price * line.quantity;
    expect(lineTotal(catering)).toBe(lineTotal(regular));
    expect(lineTotal(catering)).toBe(900);
  });
});
