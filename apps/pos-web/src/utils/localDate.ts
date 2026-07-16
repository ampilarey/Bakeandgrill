/**
 * Calendar date in the device's local timezone as YYYY-MM-DD.
 *
 * Do NOT use `toISOString().slice(0, 10)` — that is UTC and reads as
 * "yesterday" in Maldives (UTC+5) from midnight until 05:00.
 */
export function localDateYmd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
