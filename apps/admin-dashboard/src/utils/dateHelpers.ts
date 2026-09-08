/** Local calendar date as YYYY-MM-DD — avoids UTC shift near midnight (Maldives UTC+5). */
export function localISO(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export function today(): string {
  return localISO(new Date());
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localISO(d);
}

/** Local calendar date n days ahead of today (YYYY-MM-DD). */
export function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return localISO(d);
}

export function monthStart(): string {
  const d = new Date();
  d.setDate(1);
  return localISO(d);
}

/**
 * When a record was actually keyed in, as a plain local date.
 *
 * Owner, 2026-09-07: "many time we enter PO back date, can u add actual date
 * column?" — the PO date is whatever they typed, so it says nothing about
 * when the order was really entered. `created_at` does, and it arrives as a
 * UTC timestamp: slicing the first ten characters of it would name the wrong
 * day for anything entered after 7pm here, which is exactly when the shop
 * run gets typed up.
 */
export function enteredOn(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : localISO(d);
}

/** The same instant with its time, for a tooltip. */
export function enteredAt(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${localISO(d)} ${hh}:${mm}`;
}
