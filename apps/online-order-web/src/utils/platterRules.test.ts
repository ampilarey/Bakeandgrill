import { describe, expect, it } from 'vitest';
import type { PlatterGroup, PlatterSelection } from '@shared/types';
import {
  adjustPlatterSelection,
  isPlatterChildSelectable,
  isPlatterSelectionValid,
  platterPickHint,
  remainingPicksNeeded,
  resolveGroupCounts,
  surchargeTotal,
} from './platterRules';

function group(overrides: Partial<PlatterGroup> & { id: number }): PlatterGroup {
  return {
    name: 'Short eats',
    rule_type: 'exactly',
    min_count: 6,
    max_count: 6,
    size_counts: null,
    items: [
      { item_id: 1, surcharge: 0, item: { id: 1, name: 'Bajiya', is_available: true, available_now: true } },
      { item_id: 2, surcharge: 5, item: { id: 2, name: 'Gulha', is_available: true, available_now: true } },
      { item_id: 3, surcharge: 0, item: { id: 3, name: 'Kimaa', is_available: false, available_now: false } },
    ],
    ...overrides,
  };
}

function picks(rows: Array<[number, number, number]>): PlatterSelection[] {
  return rows.map(([groupId, itemId, qty]) => ({
    group_id: groupId,
    item_id: itemId,
    item_name: `Item ${itemId}`,
    quantity: qty,
    surcharge: itemId === 2 ? 5 : 0,
  }));
}

describe('platterRules', () => {
  it('resolves exactly-6 and size_counts for the selected variant', () => {
    expect(resolveGroupCounts(group({ id: 10 }), null)).toEqual({ min: 6, max: 6 });
    const tiered = group({
      id: 10,
      min_count: null,
      max_count: null,
      size_counts: { '11': 6, '12': 9 },
    });
    expect(resolveGroupCounts(tiered, 12)).toEqual({ min: 9, max: 9 });
    expect(resolveGroupCounts(tiered, 99)).toEqual({ min: 0, max: 0 });
  });

  it('blocks add until exactly 6 are picked — hint says Pick N more', () => {
    const groups = [group({ id: 10 })];
    expect(isPlatterSelectionValid(groups, picks([[10, 1, 4]]))).toBe(false);
    expect(platterPickHint(groups, picks([[10, 1, 4]]))).toBe('Pick 2 more');
    expect(remainingPicksNeeded(groups, picks([[10, 1, 4]]))).toBe(2);

    const valid = picks([[10, 1, 3], [10, 2, 3]]);
    expect(isPlatterSelectionValid(groups, valid)).toBe(true);
    expect(platterPickHint(groups, valid)).toBeNull();
  });

  it('rejects 5 and 7 for exactly-6; accepts 6', () => {
    const groups = [group({ id: 10 })];
    expect(isPlatterSelectionValid(groups, picks([[10, 1, 5]]))).toBe(false);
    expect(isPlatterSelectionValid(groups, picks([[10, 1, 7]]))).toBe(false);
    expect(isPlatterSelectionValid(groups, picks([[10, 1, 6]]))).toBe(true);
  });

  it('enforces min and range rules', () => {
    const minGroup = group({ id: 1, rule_type: 'min', min_count: 2, max_count: null });
    expect(isPlatterSelectionValid([minGroup], picks([[1, 1, 1]]))).toBe(false);
    expect(isPlatterSelectionValid([minGroup], picks([[1, 1, 2]]))).toBe(true);
    expect(isPlatterSelectionValid([minGroup], picks([[1, 1, 8]]))).toBe(true);

    const range = group({ id: 2, rule_type: 'range', min_count: 2, max_count: 4 });
    expect(isPlatterSelectionValid([range], picks([[2, 1, 1]]))).toBe(false);
    expect(isPlatterSelectionValid([range], picks([[2, 1, 3]]))).toBe(true);
    expect(isPlatterSelectionValid([range], picks([[2, 1, 5]]))).toBe(false);
  });

  it('caps picks at max via adjustPlatterSelection', () => {
    const groups = [group({ id: 10 })];
    let sel = picks([[10, 1, 5]]);
    const next = adjustPlatterSelection(groups, sel, 10, 1, 1);
    expect(next).toEqual(expect.arrayContaining([
      expect.objectContaining({ item_id: 1, quantity: 6 }),
    ]));
    expect(adjustPlatterSelection(groups, next!, 10, 2, 1)).toBeNull();
  });

  it('sums surcharges for cart price (not child catalog prices)', () => {
    expect(surchargeTotal(picks([[10, 1, 3], [10, 2, 3]]))).toBe(15);
  });

  it('marks unavailable / tomorrow-full children as not selectable', () => {
    expect(isPlatterChildSelectable(
      { is_available: false, available_now: false, allow_pre_order: true },
      'today',
    )).toBe(false);
    // Sold out today is OK for tomorrow when allow_pre_order.
    expect(isPlatterChildSelectable(
      { is_available: false, available_now: false, allow_pre_order: true, tomorrow_remaining: 2 },
      'tomorrow',
    )).toBe(true);
    expect(isPlatterChildSelectable(
      { is_available: true, available_now: true, allow_pre_order: true, tomorrow_remaining: 0 },
      'tomorrow',
    )).toBe(false);
  });
});
