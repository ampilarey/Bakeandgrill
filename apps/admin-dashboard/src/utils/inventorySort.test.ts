import { describe, expect, it } from 'vitest';
import { sortInventory } from './inventorySort';

/*
 * The stock list's ordering rules. The point of testing them apart from the
 * page: the table and the phone cards both draw this list, and a rule that
 * quietly differed between them would be the worst kind of bug to notice.
 */
const rows = [
  { name: 'Water',  quantity_on_hand: 15, reorder_level: 20,  category: { name: 'Drinks' }, usage_per_day: 5,  bought_per_day: 4, days_left: 3 },
  { name: 'Rice',   quantity_on_hand: 240, reorder_level: 50, category: { name: 'Dry' },    usage_per_day: 2,  bought_per_day: 10, days_left: 120 },
  { name: 'Gas',    quantity_on_hand: 2,  reorder_level: null, category: null,               usage_per_day: 0,  bought_per_day: 0.1, days_left: 20 },
  { name: 'Aprons', quantity_on_hand: 9,  reorder_level: null, category: { name: 'Dry' },    usage_per_day: 0,  bought_per_day: 0,   days_left: null },
];
const names = (list: typeof rows) => list.map((r) => r.name);

describe('sortInventory', () => {
  it('sorts by name without caring about case', () => {
    expect(names(sortInventory(rows, 'name'))).toEqual(['Aprons', 'Gas', 'Rice', 'Water']);
  });

  it('puts low stock first, then alphabetical', () => {
    expect(names(sortInventory(rows, 'low_first'))).toEqual(['Water', 'Aprons', 'Gas', 'Rice']);
  });

  it('runs-out-soonest opens with the item nearest empty and sinks the unknowns', () => {
    // Aprons have no rate, so no days-left figure — they must not lead.
    expect(names(sortInventory(rows, 'days_left'))).toEqual(['Water', 'Gas', 'Rice', 'Aprons']);
  });

  it('most-used stands on tracked usage first and the buying rate second', () => {
    // Gas has no tracked usage but IS bought 0.1 a day; Aprons have neither.
    expect(names(sortInventory(rows, 'usage'))).toEqual(['Water', 'Rice', 'Gas', 'Aprons']);
  });

  it('least on hand is a plain count', () => {
    expect(names(sortInventory(rows, 'on_hand'))).toEqual(['Gas', 'Aprons', 'Water', 'Rice']);
  });

  it('groups by category with the uncategorised last', () => {
    expect(names(sortInventory(rows, 'category'))).toEqual(['Water', 'Aprons', 'Rice', 'Gas']);
  });

  it('never mutates what it was given', () => {
    const before = names(rows);
    sortInventory(rows, 'on_hand');
    expect(names(rows)).toEqual(before);
  });
});
