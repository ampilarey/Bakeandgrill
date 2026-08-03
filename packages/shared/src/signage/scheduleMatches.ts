import type { SignageSchedule } from './types';

/**
 * Same rules as SignageResolver::campaignMatches / SignageScheduleMatcher —
 * date range, days-of-week, and overnight time windows.
 */
export function scheduleMatches(
  schedule: SignageSchedule | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!schedule || typeof schedule !== 'object') return true;

  const ymd = formatYmd(now);
  if (schedule.date_start && ymd < String(schedule.date_start).slice(0, 10)) return false;
  if (schedule.date_end && ymd > String(schedule.date_end).slice(0, 10)) return false;

  const days = Array.isArray(schedule.days) ? schedule.days.map(Number) : [];
  if (days.length > 0) {
    const dow = now.getDay(); // 0=Sun
    if (!days.includes(dow)) return false;
  }

  const windows = Array.isArray(schedule.windows) ? schedule.windows : [];
  if (windows.length === 0) return true;

  const hm = formatHm(now);
  for (const w of windows) {
    const start = String(w?.start ?? '00:00');
    const end = String(w?.end ?? '23:59');
    if (start <= end) {
      if (hm >= start && hm <= end) return true;
    } else if (hm >= start || hm <= end) {
      // overnight
      return true;
    }
  }
  return false;
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatHm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
