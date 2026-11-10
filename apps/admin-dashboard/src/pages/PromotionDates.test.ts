import { describe, expect, it } from 'vitest';
import { toDateBox, toInstant } from './PromotionsPage';

/* Discount audit, 2026-11-10: the edit form showed blank dates and moved the end 5 hours on save. */
describe('promotion date boxes', () => {
  it('shows a stored moment as local clock time and sends the same moment back', () => {
    const stored = '2026-11-09T10:00:00.000000Z';
    const box = toDateBox(stored);
    expect(box).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(new Date(box).getTime()).toBe(new Date(stored).getTime());
    expect(new Date(toInstant(box) as string).getTime()).toBe(new Date(stored).getTime());
    expect(new Date(toInstant(stored) as string).getTime()).toBe(new Date(stored).getTime());
  });

  it('keeps what was just typed and has nothing for nothing', () => {
    expect(toDateBox('2026-11-12T15:00')).toBe('2026-11-12T15:00');
    expect(toDateBox(null)).toBe('');
    expect(toInstant('')).toBeNull();
    expect(toInstant('2026-11-12T15:00')).toBe(new Date('2026-11-12T15:00').toISOString());
  });
});
