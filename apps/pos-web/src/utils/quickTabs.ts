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
 * How many category pills fit on one row beside the fixed pills, leaving
 * room for a "More" pill when not all of them do.
 *
 * Owner, 2026-09-02: "show all other actual categories when clicked more if
 * there is no space". Widths are estimates from label length, which is what
 * a row of same-style pills comes to within a few pixels; the alternative,
 * measuring after render, costs a second layout pass on every menu change.
 *
 * Returns how many categories to show. `rowWidth` 0 or less means the
 * width is unknown (first paint, tests), and everything is shown.
 */
export function fitCategoryPills(
  rowWidth: number,
  fixedLabels: string[],
  categoryLabels: string[],
  opts: { gap?: number; moreWidth?: number } = {},
): number {
  if (rowWidth <= 0 || categoryLabels.length === 0) return categoryLabels.length;
  const gap = opts.gap ?? 6;
  const more = opts.moreWidth ?? 92;

  let used = fixedLabels.reduce((w, label) => w + pillWidth(label) + gap, 0);
  const widths = categoryLabels.map(pillWidth);
  const total = widths.reduce((w, x) => w + x + gap, 0);
  if (used + total - gap <= rowWidth) return categoryLabels.length;

  let count = 0;
  for (const w of widths) {
    if (used + w + gap + more > rowWidth) break;
    used += w + gap;
    count += 1;
  }
  return count;
}

/** 13px bold text at roughly 7.4px a character, 16px padding each side, 1px border each side. */
export function pillWidth(label: string): number {
  return Math.ceil(label.length * 7.4) + 34;
}
