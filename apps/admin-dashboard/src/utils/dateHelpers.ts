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
