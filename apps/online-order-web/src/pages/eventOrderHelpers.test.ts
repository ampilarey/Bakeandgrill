import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ITEM_TAB,
  addCustomLine,
  buildCatalogDraftLine,
  cartHasCateringItem,
  filterItemsForTab,
  needsSelection,
  nextStep,
  parseAddItemId,
  prevStep,
  removeLine,
  resolvePreselectLine,
  showPackagingPicker,
} from './eventOrderHelpers';

describe('eventOrderHelpers', () => {
  const items = [
    { id: 1, name: 'Party Tray', base_price: 450, is_catering: true },
    { id: 2, name: 'Chicken Burger', base_price: 85, is_catering: false },
    { id: 3, name: 'Office Platter', base_price: 300, is_catering: true },
  ];

  it('defaults item tab to catering', () => {
    expect(DEFAULT_ITEM_TAB).toBe('catering');
  });

  it('filters catering vs regular tabs', () => {
    expect(filterItemsForTab(items, 'catering', '').map((i) => i.id)).toEqual([1, 3]);
    expect(filterItemsForTab(items, 'regular', '').map((i) => i.id)).toEqual([2]);
    expect(filterItemsForTab(items, 'catering', 'office').map((i) => i.id)).toEqual([3]);
  });

  it('adds and removes custom lines', () => {
    let lines = addCustomLine([], { name: 'Extra chutney', quantity: 2, notes: 'Mild' });
    expect(lines).toHaveLength(1);
    expect(lines[0].kind).toBe('custom');
    expect(lines[0].unit_price).toBeNull();
    lines = removeLine(lines, lines[0].key);
    expect(lines).toHaveLength(0);
  });

  it('steps through wizard flow', () => {
    expect(nextStep('items')).toBe('date');
    expect(nextStep('date')).toBe('done');
    expect(nextStep('done')).toBeNull();
    expect(prevStep('date')).toBe('items');
    expect(prevStep('items')).toBeNull();
  });

  it('handles ?add= preselect for catering only', () => {
    expect(parseAddItemId(new URLSearchParams('add=1'))).toBe(1);
    expect(parseAddItemId(new URLSearchParams('add=nope'))).toBeNull();
    expect(resolvePreselectLine(1, items)?.kind).toBe('catalog');
    const pre = resolvePreselectLine(1, items);
    expect(pre && pre.kind === 'catalog' ? pre.item_id : null).toBe(1);
    expect(resolvePreselectLine(2, items)).toBeNull();
    expect(resolvePreselectLine(999, items)).toBeNull();
  });

  it('detects catering items in cart for banner', () => {
    expect(cartHasCateringItem([{ item: { is_catering: false } }])).toBe(false);
    expect(cartHasCateringItem([{ item: { is_catering: true } }])).toBe(true);
    expect(cartHasCateringItem([])).toBe(false);
  });

  it('builds catalog lines with variant and packaging keys', () => {
    const item = {
      id: 10,
      name: 'Tray',
      base_price: 100,
      is_catering: true,
      has_variants: true,
      variants: [
        { id: 1, name: 'Small', price: 80, is_active: true },
        { id: 2, name: 'Large', price: 120, is_active: true },
      ],
      packaging_options: [
        { id: 5, name: 'Standard', fee: 2, is_default: true, is_active: true },
        { id: 6, name: 'Premium', fee: 5, is_default: false, is_active: true },
      ],
    };
    expect(needsSelection(item)).toBe(true);
    expect(showPackagingPicker(item)).toBe(true);
    const line = buildCatalogDraftLine(item, 2, 6);
    expect(line?.name).toBe('Tray — Large');
    expect(line?.variant_id).toBe(2);
    expect(line?.packaging_option_id).toBe(6);
    expect(line?.unit_price).toBe(120);
  });
});
