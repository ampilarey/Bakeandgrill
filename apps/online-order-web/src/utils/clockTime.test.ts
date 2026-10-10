import { describe, expect, it } from 'vitest';
import { clockTime, hoursRange } from './clockTime';

describe('clockTime', () => {
  it('reads 24-hour times the way people say them', () => {
    expect(clockTime('07:00')).toBe('7:00 AM');
    expect(clockTime('00:00')).toBe('12:00 AM');
    expect(clockTime('12:30')).toBe('12:30 PM');
    expect(clockTime('23:59:00')).toBe('11:59 PM');
  });

  it('gives nothing for something that is not a time', () => {
    expect(clockTime(null)).toBe('');
    expect(clockTime('')).toBe('');
    expect(clockTime('late')).toBe('');
    expect(clockTime('25:00')).toBe('');
  });
});

describe('hoursRange', () => {
  it('joins a day, including one that runs past midnight', () => {
    expect(hoursRange('07:00', '23:00')).toBe('7:00 AM – 11:00 PM');
    expect(hoursRange('14:00', '01:00')).toBe('2:00 PM – 1:00 AM');
  });

  it('is empty when an end is missing', () => {
    expect(hoursRange('07:00', null)).toBe('');
  });
});
