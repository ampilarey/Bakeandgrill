import { isSoldOutOnSignage } from './autoSlides';
import type { MenuItemLite } from './types';

/**
 * Sold-out grace on the board (owner's shortlist, 2026-09-23).
 *
 * A dish that runs out used to vanish from its category list at the next
 * refresh, which reads like it was never on the menu. Now it stays on the
 * list with a SOLD OUT pill for a while — long enough for the people who
 * saw it a minute ago — and then goes. Never on a showcase slide.
 *
 * The board remembers when it first saw each item sold out, and keeps
 * that across reloads, so a restart does not restart the clock.
 */
export const SOLD_OUT_BADGE_MINUTES = 20;

export type SoldOutSince = Record<string, number>;

export function trackSoldOut(
  items: MenuItemLite[],
  since: SoldOutSince,
  nowMs: number,
  minutes: number = SOLD_OUT_BADGE_MINUTES,
): { items: MenuItemLite[]; since: SoldOutSince } {
  const graceMs = Math.max(0, minutes) * 60_000;
  const next: SoldOutSince = {};
  const out: MenuItemLite[] = [];
  for (const item of items) {
    if (!isSoldOutOnSignage(item)) {
      out.push(item);
      continue;
    }
    const key = String(item.id);
    const first = since[key] ?? nowMs;
    next[key] = first;
    if (graceMs > 0 && nowMs - first < graceMs) {
      out.push({ ...item, sold_out_badge: true });
    }
    // Past the grace: dropped, but still remembered so it does not come back.
  }
  return { items: out, since: next };
}
