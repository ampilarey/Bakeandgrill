import { describe, expect, it } from 'vitest';
import { systemHealthComponentLabel } from '../api/finance';

describe('systemHealthComponentLabel', () => {
  it('returns status from the admin health probe object (avoids React #31)', () => {
    expect(systemHealthComponentLabel({ ok: true, status: 'connected', error: null })).toBe('connected');
    expect(systemHealthComponentLabel({ ok: false, status: 'unreachable' })).toBe('unreachable');
  });

  it('keeps legacy string database values working', () => {
    expect(systemHealthComponentLabel('connected')).toBe('connected');
  });

  it('falls back safely for missing or malformed values', () => {
    expect(systemHealthComponentLabel(undefined)).toBe('—');
    expect(systemHealthComponentLabel(null)).toBe('—');
    expect(systemHealthComponentLabel({})).toBe('—');
    expect(systemHealthComponentLabel({ ok: true })).toBe('—');
  });
});
