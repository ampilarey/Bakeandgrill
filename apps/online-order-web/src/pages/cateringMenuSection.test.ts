import { describe, expect, it } from 'vitest';
import type { MenuItem } from '@shared/types';

function cateringSectionItems(items: MenuItem[]): MenuItem[] {
  return items.filter((i) => !!i.is_catering);
}

describe('Online Event & catering menu section', () => {
  const items = [
    { id: 1, name: 'Burger', base_price: 40, category_id: 1, is_catering: false },
    { id: 2, name: 'Tray', base_price: 450, category_id: 2, is_catering: true },
  ] as MenuItem[];

  it('includes catering-flagged items that are already on the immediate-channel menu', () => {
    expect(cateringSectionItems(items).map((i) => i.id)).toEqual([2]);
  });

  it('hides the section when none exist', () => {
    expect(cateringSectionItems(items.filter((i) => !i.is_catering))).toHaveLength(0);
  });
});
