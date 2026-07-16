/** Venue timezone for POS calendar filters (Bake & Grill, Male'). */
export const VENUE_TIMEZONE = "Indian/Maldives";

/**
 * Calendar date in the cafe timezone as YYYY-MM-DD.
 *
 * Do NOT use `toISOString().slice(0, 10)` — that is UTC and reads as
 * "yesterday" in Maldives from midnight until 05:00.
 * Do NOT use device-local getDate() alone — a tablet left on UTC/US TZ
 * would still disagree with order numbers and the API business day.
 */
export function localDateYmd(d: Date = new Date()): string {
  // en-CA → YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VENUE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
