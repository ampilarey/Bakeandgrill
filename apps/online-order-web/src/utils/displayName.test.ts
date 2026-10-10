import { describe, expect, it } from 'vitest';
import { firstName } from './displayName';

describe('firstName', () => {
  it('takes the first word of a real name', () => {
    expect(firstName('Aishath Shifa')).toBe('Aishath');
    expect(firstName('  Ali  ')).toBe('Ali');
  });

  it('never greets by phone digits', () => {
    expect(firstName('7009995')).toBeNull();
    expect(firstName('+960 700 9995')).toBeNull();
    expect(firstName('')).toBeNull();
    expect(firstName(null)).toBeNull();
  });
});
