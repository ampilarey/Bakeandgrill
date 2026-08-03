import { describe, expect, it } from 'vitest';
import {
  isItemAvailableNow,
  itemAvailableStock,
  itemLowStockLabel,
  itemUnavailableLabel,
} from './itemAvailability';

const t = (k: string) => {
  const map: Record<string, string> = {
    'menu.out_of_stock': 'Sold out',
    'menu.unavailable_today': 'Unavailable today',
    'menu.opens_at': 'Opens at {time}',
    'menu.channel_unavailable': 'Not available for pickup / delivery',
    'menu.unavailable': 'Unavailable',
    'menu.only_n_left': 'Only {n} left',
    'menu.few_left': 'Few left',
  };
  return map[k] ?? k;
};

describe('isItemAvailableNow', () => {
  it('prefers available_now and falls back to is_available', () => {
    expect(isItemAvailableNow({ available_now: false, is_available: true })).toBe(false);
    expect(isItemAvailableNow({ available_now: true, is_available: false })).toBe(true);
    expect(isItemAvailableNow({ is_available: false })).toBe(false);
    expect(isItemAvailableNow({ is_available: true })).toBe(true);
    expect(isItemAvailableNow({})).toBe(true);
  });
});

describe('itemUnavailableLabel', () => {
  it('renders each unavailable_reason distinctly', () => {
    expect(itemUnavailableLabel({ unavailable_reason: 'out_of_stock' }, t)).toBe('Sold out');
    expect(itemUnavailableLabel({ unavailable_reason: 'snoozed' }, t)).toBe('Unavailable today');
    expect(itemUnavailableLabel({ unavailable_reason: 'channel_unavailable' }, t))
      .toBe('Not available for pickup / delivery');
    expect(itemUnavailableLabel({ unavailable_reason: 'item_unavailable' }, t)).toBe('Unavailable');
    expect(itemUnavailableLabel({ unavailable_reason: 'item_inactive' }, t)).toBe('Unavailable');
  });

  it('uses available_from for ordering_closed', () => {
    const label = itemUnavailableLabel({
      unavailable_reason: 'ordering_closed',
      available_from: '2026-08-03T18:00:00+05:00',
    }, t);
    expect(label.startsWith('Opens at ')).toBe(true);
  });

  it('appends reason note when set; nothing extra when blank', () => {
    expect(itemUnavailableLabel({
      unavailable_reason: 'snoozed',
      unavailable_reason_note: 'Back Thursday',
    }, t)).toBe('Unavailable · Back Thursday');
    expect(itemUnavailableLabel({
      unavailable_reason: 'snoozed',
      unavailable_reason_note: '  ',
    }, t)).toBe('Unavailable today');
  });
});

describe('itemLowStockLabel', () => {
  it('never badges untracked 9999 stock', () => {
    expect(itemAvailableStock({ availability: { available: true, available_stock: 9999 } })).toBeNull();
    expect(itemLowStockLabel({
      available_now: true,
      is_low_stock: true,
      availability: { available: true, available_stock: 9999 },
    }, t)).toBeNull();
  });

  it('shows Only N left at <=3 and Few left above', () => {
    expect(itemLowStockLabel({
      available_now: true,
      is_low_stock: true,
      availability: { available: true, available_stock: 2 },
    }, t)).toBe('Only 2 left');
    expect(itemLowStockLabel({
      available_now: true,
      is_low_stock: true,
      availability: { available: true, available_stock: 5 },
    }, t)).toBe('Few left');
    expect(itemLowStockLabel({
      available_now: true,
      is_low_stock: false,
      availability: { available: true, available_stock: 2 },
    }, t)).toBeNull();
  });
});
