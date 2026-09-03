import { describe, expect, it } from 'vitest';
import { emptyItemForm, formToPayload, itemToForm } from './menuItemForm';
import type { MenuItem } from '../../api';

/** Owner, 2026-09-03: "Also show in" — a home category plus extra placements. */
describe('menuItemForm "also show in"', () => {
  it('round-trips the extra categories and never sends the home as one of them', () => {
    const item = { id: 1, name: 'Bajiya', base_price: 5, category_id: 2, extra_category_ids: [3, 2, 7] } as unknown as MenuItem;
    const form = itemToForm(item);
    expect(form.category_id).toBe('2');
    expect(form.extra_category_ids).toEqual([3, 2, 7]);

    const payload = formToPayload(form, false);
    expect(payload.category_id).toBe(2);
    expect(payload.extra_category_ids).toEqual([3, 7]);
  });

  it('starts empty on a new item and sends an empty list so a cleared pick is saved', () => {
    const form = { ...emptyItemForm(1), name: 'New', base_price: '1' };
    expect(form.extra_category_ids).toEqual([]);
    expect(formToPayload(form, false).extra_category_ids).toEqual([]);
  });
});
