import { describe, it, expect } from 'vitest';
import { enteredOn, enteredAt } from './dateHelpers';

/*
 * Owner, 2026-09-07: "many time we enter PO back date, can u add actual date
 * column?" The PO date is typed and can be any day; created_at is when it was
 * really entered, and it comes over as UTC.
 *
 * Built from local times rather than fixed UTC strings, so these say the same
 * thing wherever they are run — the shop is on UTC+5, the test runner is not,
 * and an assertion that only holds in one of those is worth nothing.
 */

/** The UTC timestamp the server would send for this local moment. */
const sentAt = (y: number, m: number, d: number, hh: number, mm: number) =>
  new Date(y, m - 1, d, hh, mm).toISOString();

describe('when a record was actually entered', () => {
  it('reads a UTC timestamp back as the local day it happened on', () => {
    // The evening a shop run gets typed up.
    expect(enteredOn(sentAt(2026, 9, 7, 20, 30))).toBe('2026-09-07');
    expect(enteredAt(sentAt(2026, 9, 7, 20, 30))).toBe('2026-09-07 20:30');
  });

  it('keeps a late entry on the day it was typed', () => {
    // 23:10 local is already tomorrow in UTC in the Maldives. Slicing the
    // first ten characters of the string would name the wrong day; the day
    // it was entered is still the 7th.
    expect(enteredOn(sentAt(2026, 9, 7, 23, 10))).toBe('2026-09-07');
    expect(enteredAt(sentAt(2026, 9, 7, 23, 10))).toBe('2026-09-07 23:10');
  });

  it('pads the clock so it sorts and reads straight', () => {
    expect(enteredAt(sentAt(2026, 9, 7, 9, 5))).toBe('2026-09-07 09:05');
  });

  it('says nothing when there is nothing to say', () => {
    expect(enteredOn(null)).toBe('');
    expect(enteredOn(undefined)).toBe('');
    expect(enteredOn('not a date')).toBe('');
    expect(enteredAt(null)).toBe('');
  });
});
