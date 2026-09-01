import { describe, expect, it } from 'vitest';
import type { MenuItem } from '../../api';
import {
  countDirtyCells,
  draftsToChanges,
  fieldChanged,
  nextPrice,
  previewAction,
  roundPrice,
} from './bulkEdit';

function item(over: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 1,
    name: 'Bajiya',
    base_price: 10,
    is_available: true,
    is_active: true,
    category_id: 3,
    ...over,
  } as MenuItem;
}

describe('price arithmetic', () => {
  it('raises and lowers by percentage', () => {
    expect(nextPrice(100, { kind: 'price', mode: 'increase_pct', value: 10, round: 'none' })).toBe(110);
    expect(nextPrice(100, { kind: 'price', mode: 'decrease_pct', value: 25, round: 'none' })).toBe(75);
  });

  it('raises and lowers by amount, and sets outright', () => {
    expect(nextPrice(40, { kind: 'price', mode: 'increase_amount', value: 5, round: 'none' })).toBe(45);
    expect(nextPrice(40, { kind: 'price', mode: 'decrease_amount', value: 5, round: 'none' })).toBe(35);
    expect(nextPrice(40, { kind: 'price', mode: 'set', value: 12.5, round: 'none' })).toBe(12.5);
  });

  it('never produces a negative price', () => {
    // Taking MVR 50 off a MVR 10 item is a typo, not a giveaway.
    expect(nextPrice(10, { kind: 'price', mode: 'decrease_amount', value: 50, round: 'none' })).toBe(0);
    expect(nextPrice(10, { kind: 'price', mode: 'decrease_pct', value: 200, round: 'none' })).toBe(0);
  });

  it('rounds to something sayable on a menu board', () => {
    // 42 + 10% = 46.20, which nobody wants printed.
    expect(nextPrice(42, { kind: 'price', mode: 'increase_pct', value: 10, round: 'whole' })).toBe(46);
    expect(nextPrice(42, { kind: 'price', mode: 'increase_pct', value: 10, round: 'half' })).toBe(46);
    expect(nextPrice(42, { kind: 'price', mode: 'increase_pct', value: 10, round: 'five' })).toBe(45);
  });

  it('keeps laari precision when no rounding is asked for', () => {
    expect(roundPrice(46.2049, 'none')).toBe(46.2);
    expect(roundPrice(12.005, 'none')).toBe(12.01);
  });
});

describe('previewAction', () => {
  it('reports rows the action would not move as unchanged rather than dropping them', () => {
    // A selection that silently shrinks is how people lose track of what
    // they just did.
    const rows = previewAction(
      [item({ id: 1, base_price: 10 }), item({ id: 2, base_price: 0 })],
      { kind: 'price', mode: 'increase_pct', value: 10, round: 'none' },
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].fields).toEqual({ base_price: 11 });
    expect(rows[1].fields).toEqual({});
  });

  it('shows before and after for a price move', () => {
    const [row] = previewAction([item({ base_price: 40 })], {
      kind: 'price', mode: 'increase_amount', value: 5, round: 'none',
    });

    expect(row.before).toBe('40.00');
    expect(row.after).toBe('45.00');
  });

  it('skips items already in the target category', () => {
    const rows = previewAction(
      [item({ id: 1, category_id: 3 }), item({ id: 2, category_id: 9 })],
      { kind: 'category', categoryId: 3 },
    );

    expect(rows[0].fields).toEqual({});
    expect(rows[1].fields).toEqual({ category_id: 3 });
  });

  it('flips a plain field only where it differs', () => {
    const rows = previewAction(
      [item({ id: 1, is_available: true }), item({ id: 2, is_available: false })],
      { kind: 'field', field: 'is_available', value: false, label: 'Available' },
    );

    expect(rows[0].fields).toEqual({ is_available: false });
    expect(rows[1].fields).toEqual({});
  });
});

describe('draftsToChanges', () => {
  const items = [item({ id: 1, base_price: 10, name: 'Bajiya' }), item({ id: 2, base_price: 20 })];

  it('sends only the cells that actually differ', () => {
    const changes = draftsToChanges(items, {
      1: { base_price: 12, name: 'Bajiya' },
      2: { base_price: 20 },
    });

    // name was retyped identically and price 2 was unchanged — neither counts.
    expect(changes).toEqual([{ id: 1, fields: { base_price: 12 } }]);
  });

  it('drops rows whose every cell was typed back to the original', () => {
    expect(draftsToChanges(items, { 1: { base_price: 10 } })).toEqual([]);
    expect(countDirtyCells(items, { 1: { base_price: 10 } })).toBe(0);
  });

  it('counts cells, not rows', () => {
    const count = countDirtyCells(items, {
      1: { base_price: 11, name: 'Renamed' },
      2: { base_price: 21 },
    });

    expect(count).toBe(3);
  });

  it('ignores drafts for items no longer on the page', () => {
    expect(draftsToChanges(items, { 999: { base_price: 5 } })).toEqual([]);
  });

  it('treats a price typed as a string the same as its number', () => {
    // Number inputs hand back strings; "10.00" over a 10 is not an edit.
    expect(draftsToChanges(items, { 1: { base_price: '10.00' as unknown as number } })).toEqual([]);
  });
});

describe('fieldChanged', () => {
  it('compares booleans by truthiness', () => {
    expect(fieldChanged(item({ is_active: true }), 'is_active', true)).toBe(false);
    expect(fieldChanged(item({ is_active: true }), 'is_active', false)).toBe(true);
  });

  it('treats clearing a value as a change', () => {
    expect(fieldChanged(item({ sku: 'ABC' } as Partial<MenuItem>), 'sku', null)).toBe(true);
    expect(fieldChanged(item({ sku: null } as Partial<MenuItem>), 'sku', null)).toBe(false);
  });
});
