import { describe, expect, it } from 'vitest';
import { emptyItemForm, formToPayload, itemToForm } from './menuItemForm';
import type { MenuItem } from '../../api';

function baseItem(over: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 1,
    name: 'Loaf',
    base_price: 20,
    is_active: true,
    is_available: true,
    allow_pre_order: true,
    tomorrow_daily_capacity: 12,
    ...over,
  } as MenuItem;
}

describe('menuItemForm tomorrow daily make-limit', () => {
  it('loads and saves the make-limit when tomorrow is ticked', () => {
    const form = itemToForm(baseItem());
    expect(form.allow_pre_order).toBe(true);
    expect(form.tomorrow_daily_capacity).toBe('12');

    const payload = formToPayload(form, false);
    expect(payload.allow_pre_order).toBe(true);
    expect(payload.tomorrow_daily_capacity).toBe(12);
  });

  it('blank make-limit means no limit (null)', () => {
    const form = emptyItemForm(null);
    form.allow_pre_order = true;
    form.tomorrow_daily_capacity = '';
    form.name = 'Loaf';
    form.base_price = '20';
    expect(formToPayload(form, false).tomorrow_daily_capacity).toBeNull();
  });

  it('keeps the make-limit when tomorrow is unticked: it caps today and event dates too', () => {
    // Owner, 2026-09-21: "catering does not require stock, but there might
    // be a limit to order." The cap is a kitchen limit for any day now.
    const form = itemToForm(baseItem());
    form.allow_pre_order = false;
    form.tomorrow_daily_capacity = '12';
    expect(formToPayload(form, false).tomorrow_daily_capacity).toBe(12);
  });

  it('loads and saves the minimum per order and the notice, blank meaning none', () => {
    const form = itemToForm(baseItem({ min_order_qty: 10, lead_time_hours: 48 }));
    expect(form.min_order_qty).toBe('10');
    expect(form.lead_time_hours).toBe('48');
    const payload = formToPayload(form, false);
    expect(payload.min_order_qty).toBe(10);
    expect(payload.lead_time_hours).toBe(48);

    form.min_order_qty = '';
    form.lead_time_hours = '0';
    const cleared = formToPayload(form, false);
    expect(cleared.min_order_qty).toBeNull();
    expect(cleared.lead_time_hours).toBeNull();
  });
});
