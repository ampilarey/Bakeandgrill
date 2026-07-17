import { describe, it, expect, afterEach, vi } from 'vitest';
import { localISO, today, daysAgo, daysFromToday, monthStart } from '../utils/dateHelpers';

describe('dateHelpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('localISO uses local calendar date, not UTC', () => {
    // 2026-07-08 22:00 in UTC+5 is still 2026-07-08 locally but 2026-07-08 17:00 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T17:00:00.000Z'));
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-07-08');
    expect(today()).toBe('2026-07-08');
  });

  it('daysAgo subtracts calendar days in local time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T12:00:00.000Z'));
    expect(daysAgo(7)).toBe(localISO(new Date(Date.now() - 7 * 86400000)));
  });

  it('daysFromToday adds calendar days in local time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T12:00:00.000Z'));
    expect(daysFromToday(3)).toBe(localISO(new Date(Date.now() + 3 * 86400000)));
    expect(daysFromToday(0)).toBe(today());
  });

  it('monthStart returns first day of current month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
    expect(monthStart()).toBe('2026-07-01');
  });
});
