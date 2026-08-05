import { beforeEach, describe, expect, it } from 'vitest';
import { getOrderDay, setOrderDay } from './menu';

function localDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

describe('order day persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to today', () => {
    expect(getOrderDay()).toBe('today');
  });

  it('persists tomorrow and reads it back the same day', () => {
    setOrderDay('tomorrow');
    expect(getOrderDay()).toBe('tomorrow');
  });

  it('persists today', () => {
    setOrderDay('tomorrow');
    setOrderDay('today');
    expect(getOrderDay()).toBe('today');
  });

  it('resets a stale "tomorrow" saved on a previous calendar day', () => {
    setOrderDay('tomorrow');
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    localStorage.setItem('bakegrill_order_day_saved_on', localDateString(yesterday));
    expect(getOrderDay()).toBe('today');
    // The stale entry is cleared, not just masked.
    expect(localStorage.getItem('bakegrill_order_day')).toBeNull();
  });

  it('dispatches order_day_change on set', () => {
    let fired = 0;
    const listener = () => { fired += 1; };
    window.addEventListener('order_day_change', listener);
    setOrderDay('tomorrow');
    window.removeEventListener('order_day_change', listener);
    expect(fired).toBe(1);
  });
});
