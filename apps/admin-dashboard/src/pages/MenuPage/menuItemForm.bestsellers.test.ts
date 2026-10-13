import { describe, expect, it } from 'vitest';
import { emptyItemForm, formToPayload, itemToForm } from './menuItemForm';
import type { MenuItem } from '../../api';

/*
 * Owner, 2026-10-13: "Some items like water bottles are always in the best
 * sellers section but I don't want some items be there." Keep out of best
 * sellers rides the item's form and save payload like the other switches.
 */
const water: MenuItem = {
  id: 7,
  name: 'Water Bottle',
  base_price: 5,
  is_active: true,
  is_available: true,
  hide_from_bestsellers: true,
};

describe('menuItemForm keep out of best sellers', () => {
  it('reads the switch from the item and defaults it off', () => {
    expect(itemToForm(water).hide_from_bestsellers).toBe(true);
    expect(itemToForm({ ...water, hide_from_bestsellers: undefined }).hide_from_bestsellers).toBe(false);
    expect(emptyItemForm(1).hide_from_bestsellers).toBe(false);
  });

  it('saves it either way', () => {
    const form = itemToForm(water);
    expect(formToPayload(form, false).hide_from_bestsellers).toBe(true);
    form.hide_from_bestsellers = false;
    expect(formToPayload(form, false).hide_from_bestsellers).toBe(false);
  });
});
