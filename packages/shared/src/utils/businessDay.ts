/**
 * Venue calendar day helpers (Maldives, UTC+5).
 *
 * Mirrors backend App\Support\BusinessDay — order numbers, POS "Today",
 * and collect-tomorrow handover must share the same day boundary.
 * Do not use raw UTC midnight when the cafe is still open in Malé.
 */
export const BUSINESS_TIMEZONE = 'Indian/Maldives';

/** Fixed offset — Maldives has no DST. */
const BUSINESS_OFFSET = '+05:00';

/** Today's calendar date in the restaurant timezone as YYYY-MM-DD. */
export function businessTodayYmd(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** True when `ymd` (YYYY-MM-DD) is strictly after the restaurant's today. */
export function isBusinessDateInFuture(ymd: string, now: Date = new Date()): boolean {
  const day = String(ymd).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return day > businessTodayYmd(now);
}

/** Inclusive start of a business day as an ISO-8601 timestamp (+05:00). */
export function businessDayStartIso(ymd: string): string {
  const day = String(ymd).slice(0, 10);
  return `${day}T00:00:00${BUSINESS_OFFSET}`;
}

/** Short label for cashiers, e.g. "Wed, 5 Aug". */
export function formatBusinessDayLabel(ymd: string): string {
  const day = String(ymd).slice(0, 10);
  const d = new Date(`${day}T12:00:00${BUSINESS_OFFSET}`);
  if (!Number.isFinite(d.getTime())) return day;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIMEZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d);
}
