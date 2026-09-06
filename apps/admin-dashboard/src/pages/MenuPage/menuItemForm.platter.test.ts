import { describe, expect, it } from 'vitest';
import { emptyItemForm, emptyPlatterGroupRow, formToPayload, itemToForm } from './menuItemForm';
import type { MenuItem } from '../../api';

function baseItem(over: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 1,
    name: 'Hedhikaa Platter',
    base_price: 120,
    is_active: true,
    is_available: true,
    is_combo: true,
    is_platter: true,
    platter_groups: [
      {
        id: 10,
        name: 'Short eats',
        rule_type: 'exactly',
        min_count: 6,
        max_count: 6,
        size_counts: null,
        items: [
          { item_id: 2, surcharge: 0, item: { id: 2, name: 'Bajiya', base_price: 8 } },
          { item_id: 3, surcharge: 5, item: { id: 3, name: 'Gulha', base_price: 10 } },
        ],
      },
    ],
    ...over,
  } as MenuItem;
}

describe('menuItemForm platter definition', () => {
  it('loads platter groups into choose mode', () => {
    const form = itemToForm(baseItem());
    expect(form.is_combo).toBe(true);
    expect(form.combo_mode).toBe('choose');
    expect(form.platter_groups).toHaveLength(1);
    expect(form.platter_groups[0].name).toBe('Short eats');
    expect(form.platter_groups[0].rule_type).toBe('exactly');
    expect(form.platter_groups[0].choose_count).toBe('6');
    expect(form.platter_groups[0].items).toHaveLength(2);
    expect(form.platter_groups[0].items[1].surcharge).toBe('5');
  });

  it('saves choose-any-6 platter payload', () => {
    const form = emptyItemForm(null);
    form.name = 'Hedhikaa Platter';
    form.base_price = '120';
    form.is_combo = true;
    form.combo_mode = 'choose';
    const group = emptyPlatterGroupRow();
    group.name = 'Short eats';
    group.rule_type = 'exactly';
    group.choose_count = '6';
    group.items = [
      { item_id: '2', item_name: 'Bajiya', surcharge: '0' },
      { item_id: '3', item_name: 'Gulha', surcharge: '5' },
    ];
    form.platter_groups = [group];

    const payload = formToPayload(form, false);
    expect(payload.is_combo).toBe(true);
    expect(payload.combo_items).toEqual([]);
    expect(payload.platter_groups).toHaveLength(1);
    expect(payload.platter_groups?.[0]).toMatchObject({
      name: 'Short eats',
      rule_type: 'exactly',
      min_count: 6,
      max_count: 6,
    });
    expect(payload.platter_groups?.[0].items).toEqual([
      { item_id: 2, variant_id: null, surcharge: 0, sort_order: 0 },
      { item_id: 3, variant_id: null, surcharge: 5, sort_order: 1 },
    ]);
  });

  it('maps per-size counts onto variant ids for tiered platters', () => {
    const form = emptyItemForm(null);
    form.name = 'Party Platter';
    form.base_price = '0';
    form.is_combo = true;
    form.combo_mode = 'choose';
    form.has_variants = true;
    form.variants = [
      { _key: 'k6', id: 11, name: '6 piece', price: 120, is_active: true, sort_order: 0 },
      { _key: 'k9', id: 12, name: '9 piece', price: 165, is_active: true, sort_order: 1 },
      { _key: 'k12', id: 13, name: '12 piece', price: 210, is_active: true, sort_order: 2 },
    ];
    const group = emptyPlatterGroupRow();
    group.name = 'Short eats';
    group.rule_type = 'exactly';
    group.size_counts = { '11': '6', '12': '9', '13': '12' };
    group.items = [{ item_id: '2', surcharge: '0' }];
    form.platter_groups = [group];

    const payload = formToPayload(form, false);
    expect(payload.platter_groups?.[0].size_counts).toEqual({
      '11': 6,
      '12': 9,
      '13': 12,
    });
    expect(payload.platter_groups?.[0].min_count).toBeNull();
    expect(payload.platter_groups?.[0].max_count).toBeNull();
  });

  it('uses variant names as size_counts keys when variants are unsaved', () => {
    const form = emptyItemForm(null);
    form.name = 'Party Platter';
    form.base_price = '0';
    form.is_combo = true;
    form.combo_mode = 'choose';
    form.has_variants = true;
    form.variants = [
      { _key: 'k6', name: '6 piece', price: 120, is_active: true },
      { _key: 'k9', name: '9 piece', price: 165, is_active: true },
    ];
    const group = emptyPlatterGroupRow();
    group.name = 'Short eats';
    group.rule_type = 'exactly';
    group.size_counts = { k6: '6', k9: '9' };
    group.items = [{ item_id: '2', surcharge: '0' }];
    form.platter_groups = [group];

    const payload = formToPayload(form, false);
    expect(payload.platter_groups?.[0].size_counts).toEqual({
      '6 piece': 6,
      '9 piece': 9,
    });
  });

  it('fixed combo mode clears platter_groups in the payload', () => {
    const form = itemToForm(baseItem());
    form.combo_mode = 'fixed';
    form.combo_items = [{ item_id: '2', quantity: '1', is_optional: false, surcharge: '' }];
    const payload = formToPayload(form, false);
    expect(payload.combo_items).toHaveLength(1);
    expect(payload.platter_groups).toEqual([]);
  });

  it('only an optional component carries a surcharge', () => {
    // A required child comes with the bundle and is already in its price, so
    // a stray number on one must not become a charge.
    const form = itemToForm(baseItem());
    form.combo_mode = 'fixed';
    form.combo_items = [
      { item_id: '2', quantity: '1', is_optional: false, surcharge: '9' },
      { item_id: '3', quantity: '1', is_optional: true, surcharge: '15' },
    ];

    const payload = formToPayload(form, false);

    expect(payload.combo_items?.[0]?.surcharge).toBe(0);
    expect(payload.combo_items?.[1]?.surcharge).toBe(15);
  });
});
