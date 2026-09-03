import type { PosQuickTab } from "../api";

/**
 * Pure helpers behind the Quick tabs and the category strip. Kept out of
 * MenuGrid so they can be tested without a render.
 */

export type QuickScope = "mine" | "shared";

/** A tab with the layout it belongs to, as the strip draws them. */
export type ScopedQuickTab = PosQuickTab & { scope: QuickScope };

export function tabKey(scope: QuickScope, id: string): string {
  return `${scope}:${id}`;
}

/** Own tabs first, then the shared ones — the cashier's own come to hand first. */
export function flattenTabs(layout: { mine: PosQuickTab[]; shared: PosQuickTab[] }): ScopedQuickTab[] {
  return [
    ...layout.mine.map((t) => ({ ...t, scope: "mine" as const })),
    ...layout.shared.map((t) => ({ ...t, scope: "shared" as const })),
  ];
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Whether a tab's hours cover this moment. A window that ends before it
 * starts ("22:00"–"02:00") runs past midnight. A window with equal ends
 * covers the whole day.
 */
export function tabOpenAt(tab: PosQuickTab, now: Date): boolean {
  if (!tab.from || !tab.to) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  const from = minutes(tab.from);
  const to = minutes(tab.to);
  if (from === to) return true;
  return from < to ? t >= from && t < to : t >= from || t < to;
}

/**
 * The tab that should open itself now: the first, in strip order, whose
 * hours cover this moment. Own tabs win over shared ones because they come
 * first in the strip.
 */
export function autoTabKey(tabs: ScopedQuickTab[], now: Date): string | null {
  const hit = tabs.find((t) => tabOpenAt(t, now));
  return hit ? tabKey(hit.scope, hit.id) : null;
}

/** A fresh tab id that is not already in use in the layout. */
export function newTabId(existing: PosQuickTab[]): string {
  const taken = new Set(existing.map((t) => t.id));
  let n = 1;
  while (taken.has(`tab-${n}`)) n += 1;
  return `tab-${n}`;
}

export function moveInList<T>(list: T[], from: number, delta: -1 | 1): T[] {
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/**
 * Which pills fit on one line, between a pill pinned at the left and "More"
 * pinned at the right.
 *
 * Owner, 2026-09-03: "keep fixed to the screen — left side All, right side
 * More, in between tabs to fit the screen." The strip used to scroll
 * sideways, so a tab could be off-screen with nothing to say so; now
 * everything that does not fit is reachable in one place.
 *
 * Widths are estimated from label length, as {@see pillWidth} explains, so a
 * safety margin is held back: over-estimating costs an empty gap, while
 * under-estimating would clip a pill with no way to scroll to it.
 *
 * `rowWidth` 0 or less means the width is not known yet (first paint, tests)
 * and everything is shown.
 */
export function fitPillRow(
  rowWidth: number,
  pinnedLabel: string,
  labels: string[],
  opts: { gap?: number; moreLabel?: string; safety?: number } = {},
): { visible: number[]; hidden: number[] } {
  const all = labels.map((_, i) => i);
  if (rowWidth <= 0) return { visible: all, hidden: [] };

  const gap = opts.gap ?? 6;
  const room = rowWidth - (opts.safety ?? 10);
  const widths = labels.map(pillWidth);
  let used = pillWidth(pinnedLabel);

  if (used + widths.reduce((w, x) => w + gap + x, 0) <= room) {
    return { visible: all, hidden: [] };
  }

  const more = pillWidth(opts.moreLabel ?? `More (${labels.length})`);
  const visible: number[] = [];
  const hidden: number[] = [];
  for (let i = 0; i < labels.length; i += 1) {
    // Once one pill is over the line the rest follow it, so the strip keeps
    // its order instead of pulling a short label forward past a long one.
    if (hidden.length === 0 && used + gap + widths[i] + gap + more <= room) {
      used += gap + widths[i];
      visible.push(i);
    } else {
      hidden.push(i);
    }
  }
  return { visible, hidden };
}

/** 13px bold text at roughly 7.4px a character, 16px padding each side, 1px border each side. */
export function pillWidth(label: string): number {
  return Math.ceil(label.length * 7.4) + 34;
}
