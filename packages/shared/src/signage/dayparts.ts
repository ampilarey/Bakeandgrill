import { scheduleMatches } from './scheduleMatches';
import type { SignageSchedule } from './types';

/**
 * Day parts and sleep, set on a screen's or group's look in admin.
 *
 * A day part is a window of the day (and optionally days of the week)
 * during which the generated menu shows only some categories — breakfast
 * until 11, lunch 11–3, tea-time short eats after — and may switch preset.
 * Sleep is the hours the screen goes black: off at closing, back on before
 * opening, so the TV is not lit all night and the panel does not burn in.
 * Both are judged on the board by its own clock (kept to server time), so
 * the switch happens on the minute, not on the next config refresh.
 */
export type SignageDaypart = {
  id: string;
  label: string;
  schedule?: SignageSchedule | null;
  category_ids: number[];
  preset?: string | null;
};

export type SignageSleep = {
  enabled: boolean;
  /** "HH:MM" — screen goes black. */
  off: string;
  /** "HH:MM" — screen comes back. May be past midnight relative to `off`. */
  on: string;
  /** 0=Sun … 6=Sat; empty = every day. Judged at the `off` time. */
  days?: number[] | null;
};

function hm(v: unknown, fallback: string): string {
  return typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : fallback;
}

/** The first day part whose schedule matches now, in the order they were saved. */
export function activeDaypart(dayparts: unknown, now: Date = new Date()): SignageDaypart | null {
  if (!Array.isArray(dayparts)) return null;
  for (const raw of dayparts) {
    if (!raw || typeof raw !== 'object') continue;
    const dp = raw as Partial<SignageDaypart>;
    if (!scheduleMatches(dp.schedule ?? null, now)) continue;
    return {
      id: String(dp.id ?? ''),
      label: String(dp.label ?? ''),
      schedule: dp.schedule ?? null,
      category_ids: Array.isArray(dp.category_ids) ? dp.category_ids.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [],
      preset: typeof dp.preset === 'string' && dp.preset !== '' ? dp.preset : null,
    };
  }
  return null;
}

/**
 * Whether the screen should be black right now. An overnight window
 * ("23:00" → "06:45") is judged on the day it starts; a window that ends
 * before midnight is judged on the same day.
 */
export function isAsleep(sleep: unknown, now: Date = new Date()): boolean {
  if (!sleep || typeof sleep !== 'object') return false;
  const s = sleep as Partial<SignageSleep>;
  if (!s.enabled) return false;
  const off = hm(s.off, '');
  const on = hm(s.on, '');
  if (!off || !on || off === on) return false;

  const days = Array.isArray(s.days) ? s.days.map(Number).filter((d) => d >= 0 && d <= 6) : [];
  if (days.length === 0) {
    return scheduleMatches({ windows: [{ start: off, end: on }] }, now);
  }
  // With days set, an overnight window belongs to the day it began.
  const hmNow = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const overnight = off > on;
  if (!overnight) return days.includes(now.getDay()) && hmNow >= off && hmNow <= on;
  if (hmNow >= off) return days.includes(now.getDay());
  if (hmNow <= on) return days.includes((now.getDay() + 6) % 7);
  return false;
}

/** "Back at 06:45" — for the corner of a sleeping screen. */
export function sleepUntilLabel(sleep: unknown): string {
  const s = (sleep && typeof sleep === 'object' ? sleep : {}) as Partial<SignageSleep>;
  const on = hm(s.on, '');
  return on ? `Back at ${on}` : '';
}
