/**
 * Opening hours as people read them (UI audit, 2026-10-10): the Hours page
 * said "7:00 AM", the footer "07:00" and the website "00:00 – 23:59". One
 * style everywhere now, the same as the website's.
 */

/** "07:00" or "19:30:00" as "7:00 AM" / "7:30 PM"; '' when it is not a time. */
export function clockTime(hhmm: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec((hhmm ?? '').trim());
  if (!m) return '';
  const h = Number(m[1]);
  if (h > 23) return '';
  const hour = h % 12 || 12;
  return `${hour}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** A day's hours as "7:00 AM – 11:00 PM"; '' when either end is missing. */
export function hoursRange(open: string | null | undefined, close: string | null | undefined): string {
  const from = clockTime(open);
  const to = clockTime(close);
  return from && to ? `${from} – ${to}` : '';
}
