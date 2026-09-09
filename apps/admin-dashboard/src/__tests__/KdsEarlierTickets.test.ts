import { describe, it, expect } from 'vitest';
import { splitByDay } from '../pages/KDSPage';
import type { KdsTicket } from '../api';

/*
 * Owner, 2026-09-09: the kitchen display was carrying four days of paid
 * tickets nobody had bumped. Because the queue runs oldest first, a brand
 * new order sat below all 77 of them, which is the dangerous part — the
 * order you need to cook is the one you cannot see.
 *
 * Anything from before today now drops under its own heading.
 */

const NOW = new Date(2026, 8, 9, 11, 0); // 9 Sep 2026, 11:00 local

function ticket(id: number, created: Date): KdsTicket {
  return { id, created_at: created.toISOString() } as KdsTicket;
}

const todayLunch = ticket(1, new Date(2026, 8, 9, 12, 30));
const todayEarly = ticket(2, new Date(2026, 8, 9, 0, 5));
const theFirst = ticket(3, new Date(2026, 8, 1, 19, 0));
const theFifth = ticket(4, new Date(2026, 8, 5, 19, 0));

describe('Splitting the kitchen queue by day', () => {
  it('puts today first and everything older beneath it', () => {
    const groups = splitByDay([theFirst, theFifth, todayLunch], NOW);

    expect(groups.map((g) => g.earlier)).toEqual([false, true]);
    expect(groups[0].tickets.map((t) => t.id)).toEqual([1]);
    expect(groups[1].tickets.map((t) => t.id)).toEqual([3, 4]);
  });

  it('keeps the order within each group, so oldest is still cooked first', () => {
    const groups = splitByDay([theFirst, theFifth], NOW);

    expect(groups[0].tickets.map((t) => t.id)).toEqual([3, 4]);
  });

  it('draws no divider on an ordinary service', () => {
    const groups = splitByDay([todayEarly, todayLunch], NOW);

    expect(groups).toHaveLength(1);
    expect(groups[0].earlier).toBe(false);
  });

  it('shows only the earlier group when nothing has come in today', () => {
    const groups = splitByDay([theFirst], NOW);

    expect(groups).toHaveLength(1);
    expect(groups[0].earlier).toBe(true);
  });

  it('counts just after midnight as today, not as a leftover', () => {
    const groups = splitByDay([todayEarly], NOW);

    expect(groups[0].earlier).toBe(false);
  });

  it('copes with an empty queue and with an unreadable date', () => {
    expect(splitByDay([], NOW)).toEqual([]);

    const broken = { id: 9, created_at: 'not a date' } as KdsTicket;
    const groups = splitByDay([broken], NOW);
    // Unreadable means we cannot prove it is old, so it stays with today.
    expect(groups[0].earlier).toBe(false);
  });
});
