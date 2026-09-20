import { describe, expect, it } from 'vitest';
import {
  isItemAvailableNow,
  isItemOrderableForDay,
  isTomorrowFullyBooked,
  itemAvailableStock,
  itemLowStockLabel,
  itemTomorrowLowLabel,
  itemUnavailableLabel,
} from './itemAvailability';

const t = (k: string) => {
  const map: Record<string, string> = {
    'menu.out_of_stock': 'Sold out',
    'menu.sold_out_tomorrow': 'Sold out for tomorrow',
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

describe('isItemOrderableForDay', () => {
  it('today follows available_now (stock / 86 state applies)', () => {
    expect(isItemOrderableForDay({ available_now: false, allow_pre_order: true }, 'today')).toBe(false);
    expect(isItemOrderableForDay({ available_now: true, allow_pre_order: false }, 'today')).toBe(true);
  });

  it('tomorrow ignores today stock — allow_pre_order gates eligibility', () => {
    // Sold out today but made fresh for tomorrow.
    expect(isItemOrderableForDay({ available_now: false, allow_pre_order: true }, 'tomorrow')).toBe(true);
    // Available now but the owner has not ticked pre-order.
    expect(isItemOrderableForDay({ available_now: true, allow_pre_order: false }, 'tomorrow')).toBe(false);
    expect(isItemOrderableForDay({ available_now: true }, 'tomorrow')).toBe(false);
  });

  it('tomorrow daily make-limit: remaining 0 is not orderable; null is unlimited', () => {
    expect(isItemOrderableForDay({
      allow_pre_order: true,
      tomorrow_remaining: 0,
    }, 'tomorrow')).toBe(false);
    expect(isItemOrderableForDay({
      allow_pre_order: true,
      tomorrow_remaining: 2,
    }, 'tomorrow')).toBe(true);
    expect(isItemOrderableForDay({
      allow_pre_order: true,
      tomorrow_remaining: null,
    }, 'tomorrow')).toBe(true);
    expect(isTomorrowFullyBooked({ allow_pre_order: true, tomorrow_remaining: 0 })).toBe(true);
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

describe('itemTomorrowLowLabel', () => {
  it('shows Only N left when remaining is low but not full', () => {
    expect(itemTomorrowLowLabel({ allow_pre_order: true, tomorrow_remaining: 2 }, t)).toBe('Only 2 left');
    expect(itemTomorrowLowLabel({ allow_pre_order: true, tomorrow_remaining: 5 }, t)).toBe('Few left');
    expect(itemTomorrowLowLabel({ allow_pre_order: true, tomorrow_remaining: 0 }, t)).toBeNull();
    expect(itemTomorrowLowLabel({ allow_pre_order: true, tomorrow_remaining: null }, t)).toBeNull();
  });
});

/**
 * Owner, 2026-09-21: "catering does not require stock, but there might be a
 * limit to order." The dish's own minimum and notice, read from the feed.
 */
describe('item order limits', () => {
  const t = (k: string) => k;

  it('reads the minimum per order, defaulting to one', async () => {
    const { itemMinOrderQty } = await import('./itemAvailability');
    expect(itemMinOrderQty({ min_order_qty: 10 })).toBe(10);
    expect(itemMinOrderQty({ min_order_qty: 1 })).toBe(1);
    expect(itemMinOrderQty({ min_order_qty: null })).toBe(1);
    expect(itemMinOrderQty({})).toBe(1);
  });

  it('keeps a dish off tomorrow when its notice runs past the end of tomorrow', async () => {
    const { isItemOrderableForDay, needsMoreNoticeThan, endOfTomorrow, itemNoticeLabel } = await import('./itemAvailability');
    const now = new Date('2026-08-04T15:00:00');
    const base = { available_now: true, is_available: true, allow_pre_order: true, tomorrow_remaining: null };

    expect(isItemOrderableForDay({ ...base, lead_time_hours: 48 }, 'tomorrow', now)).toBe(false);
    expect(isItemOrderableForDay({ ...base, lead_time_hours: 24 }, 'tomorrow', now)).toBe(true);
    expect(isItemOrderableForDay({ ...base, lead_time_hours: null }, 'tomorrow', now)).toBe(true);
    expect(needsMoreNoticeThan({ lead_time_hours: 48 }, endOfTomorrow(now), now)).toBe(true);
    expect(itemNoticeLabel({ lead_time_hours: 48 })).toBe("Needs 48 hours' notice");
  });

  it("shows the server's wording for a dish that needs notice today", async () => {
    const { itemUnavailableLabel } = await import('./itemAvailability');
    expect(itemUnavailableLabel({
      unavailable_reason: 'needs_notice',
      availability: { available: false, reason_code: 'needs_notice', reason_message: "Needs 48 hours' notice", available_stock: null, available_from: null },
    }, t)).toBe("Needs 48 hours' notice");
  });
});
