import { describe, expect, it } from 'vitest';
import { emptyItemForm, formToPayload, itemToForm } from './menuItemForm';
import type { MenuItem } from '../../api';

const baseItem: MenuItem = {
  id: 1,
  name: 'Chicken Grill Platter',
  name_dv: 'DV Name',
  description: 'Full description for the detail sheet',
  base_price: 85,
  is_active: true,
  is_available: true,
  card_name: 'Chicken Grill',
  card_name_dv: 'DV Card',
  short_description: 'Smoky & juicy',
  short_description_dv: 'DV detail',
  price_note: 'from',
};

describe('menuItemForm card display fields', () => {
  it('maps card fields into form state', () => {
    const form = itemToForm(baseItem);
    expect(form.card_name).toBe('Chicken Grill');
    expect(form.card_name_dv).toBe('DV Card');
    expect(form.short_description).toBe('Smoky & juicy');
    expect(form.short_description_dv).toBe('DV detail');
    expect(form.price_note).toBe('from');
  });

  it('includes card fields in save payload (null when empty)', () => {
    const form = emptyItemForm(2);
    form.name = 'Tea';
    form.base_price = '10';
    form.card_name = '  Short Tea  ';
    form.short_description = 'Hot & fresh';
    form.price_note = 'per cup';

    const payload = formToPayload(form, false);
    expect(payload.card_name).toBe('Short Tea');
    expect(payload.card_name_dv).toBeNull();
    expect(payload.short_description).toBe('Hot & fresh');
    expect(payload.short_description_dv).toBeNull();
    expect(payload.price_note).toBe('per cup');
  });
});
