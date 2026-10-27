import type { TrendFigures, TrendGroup, TrendPoint } from '../../api';

/*
 * The dashboard's Sales section (owner, 2026-10-27: "enhance the admin dash
 * board … more advanced graphics and features and animations"): the periods,
 * the metrics, the axis and the export, kept apart from the drawing so they can
 * be tested on their own.
 */

export type PresetKey = 'today' | 'yesterday' | 'this_week' | 'last_7' | 'this_month' | 'last_30' | 'last_month' | 'custom';

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This week' },
  { key: 'last_7', label: 'Last 7 days' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_30', label: 'Last 30 days' },
  { key: 'last_month', label: 'Last month' },
  { key: 'custom', label: 'Pick dates' },
];

export type Range = { from: string; to: string };

const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s: string) => new Date(`${s}T00:00:00`);
const addDays = (d: Date, n: number) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };

/** Days from `from` to `to`, both counted. */
export function spanDays(r: Range): number {
  return Math.round((parse(r.to).getTime() - parse(r.from).getTime()) / 86_400_000) + 1;
}

export function presetRange(key: PresetKey, now: Date = new Date()): Range {
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (key) {
    case 'yesterday': { const y = addDays(t, -1); return { from: iso(y), to: iso(y) }; }
    case 'this_week': { const dow = (t.getDay() + 6) % 7; return { from: iso(addDays(t, -dow)), to: iso(t) }; }
    case 'last_7': return { from: iso(addDays(t, -6)), to: iso(t) };
    case 'this_month': return { from: iso(new Date(t.getFullYear(), t.getMonth(), 1)), to: iso(t) };
    case 'last_30': return { from: iso(addDays(t, -29)), to: iso(t) };
    case 'last_month': {
      const first = new Date(t.getFullYear(), t.getMonth() - 1, 1);
      return { from: iso(first), to: iso(new Date(t.getFullYear(), t.getMonth(), 0)) };
    }
    default: return { from: iso(t), to: iso(t) };
  }
}

/**
 * The ‹ › arrows: the same length of time earlier or later. A whole calendar
 * month steps by months, so "This month" back once is last month, not 27 days.
 * Never past today.
 */
export function shiftRange(r: Range, dir: -1 | 1, now: Date = new Date()): Range {
  const from = parse(r.from);
  const to = parse(r.to);
  const todayIso = iso(now);
  const monthStart = from.getDate() === 1;
  const monthEnd = addDays(to, 1).getDate() === 1 || r.to === todayIso;
  let next: Range;
  if (monthStart && monthEnd && from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    const f = new Date(from.getFullYear(), from.getMonth() + dir, 1);
    next = { from: iso(f), to: iso(new Date(f.getFullYear(), f.getMonth() + 1, 0)) };
  } else {
    const n = spanDays(r) * dir;
    next = { from: iso(addDays(from, n)), to: iso(addDays(to, n)) };
  }
  if (next.to > todayIso) next = { ...next, to: todayIso };
  return next;
}

/** The finest grouping that reads well for the period. */
export function defaultGroup(days: number): TrendGroup {
  if (days <= 2) return 'hour';
  if (days <= 62) return 'day';
  if (days <= 190) return 'week';
  return 'month';
}

export const HOUR_MAX_DAYS = 7;

export type MetricKey = 'sales' | 'net' | 'orders' | 'avg_order' | 'refunds' | 'discounts' | 'items' | 'tax';

export const METRICS: { key: MetricKey; label: string; money: boolean; upIsGood: boolean; hint: string }[] = [
  { key: 'sales', label: 'Sales', money: true, upIsGood: true, hint: 'Every paid order, at any stage' },
  { key: 'net', label: 'Net sales', money: true, upIsGood: true, hint: 'Sales less refunds and GST' },
  { key: 'orders', label: 'Orders', money: false, upIsGood: true, hint: 'Paid orders' },
  { key: 'avg_order', label: 'Average order', money: true, upIsGood: true, hint: 'Sales ÷ orders' },
  { key: 'items', label: 'Items sold', money: false, upIsGood: true, hint: 'Dishes and drinks on those orders' },
  { key: 'refunds', label: 'Refunds', money: true, upIsGood: false, hint: 'Approved in the period' },
  { key: 'discounts', label: 'Discounts', money: true, upIsGood: false, hint: 'Taken off those orders' },
  { key: 'tax', label: 'GST', money: true, upIsGood: true, hint: 'Collected on those orders, owed to MIRA' },
];

export function metricOf(key: MetricKey) {
  return METRICS.find((m) => m.key === key) ?? METRICS[0];
}

export function valueOf(f: TrendFigures, key: MetricKey): number {
  return Number(f[key] ?? 0);
}

/** Against the period before: the change and its share, or null when there was nothing before. */
export function change(now: number, before: number): { diff: number; pct: number | null } {
  const diff = now - before;
  return { diff, pct: before === 0 ? null : (diff / Math.abs(before)) * 100 };
}

export function money(v: number, digits = 2): string {
  return `MVR ${v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function count(v: number): string {
  return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function formatMetric(key: MetricKey, v: number): string {
  return metricOf(key).money ? money(v) : count(v);
}

/** Axis ticks: 0 / 1K / 2.5K, MVR left to the title. */
export function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${+(v / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${+(v / 1_000).toFixed(1)}K`;
  return `${+v.toFixed(v % 1 === 0 ? 0 : 1)}`;
}

/** Clean ticks from 0 to just above the top value. */
export function niceTicks(max: number, target = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) out.push(+v.toFixed(6));
  return out;
}

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });

function hourWord(h: number): string {
  const suffix = h < 12 ? 'AM' : 'PM';
  const n = h % 12 === 0 ? 12 : h % 12;
  return `${n} ${suffix}`;
}

export { hourWord };

/** What a point is called: "9 AM", "Tue 21 Oct", "13–19 Oct", "Oct 2026". */
export function pointLabel(p: { from: string; to: string }, group: TrendGroup, short = false): string {
  if (group === 'hour') return hourWord(Number(p.from.slice(11, 13)));
  const f = parse(p.from.slice(0, 10));
  if (group === 'day') return short ? DATE.format(f) : DAY.format(f);
  if (group === 'month') return MONTH.format(f);
  const t = parse(p.to.slice(0, 10));
  return f.getMonth() === t.getMonth() ? `${f.getDate()}–${DATE.format(t)}` : `${DATE.format(f)} – ${DATE.format(t)}`;
}

export function rangeLabel(r: Range): string {
  const f = parse(r.from);
  const t = parse(r.to);
  const year = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (r.from === r.to) return DAY.format(f) + ` ${f.getFullYear()}`;
  return f.getFullYear() === t.getFullYear() ? `${DATE.format(f)} – ${year.format(t)}` : `${year.format(f)} – ${year.format(t)}`;
}

/** The table, as a spreadsheet file. */
export function toCsv(points: TrendPoint[], group: TrendGroup): string {
  const head = ['Period', 'From', 'To', 'Sales', 'Refunds', 'Discounts', 'GST', 'Net sales', 'Orders', 'Average order', 'Items sold'];
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = points.map((p) => [
    pointLabel(p, group), p.from, p.to,
    p.sales.toFixed(2), p.refunds.toFixed(2), p.discounts.toFixed(2), p.tax.toFixed(2), p.net.toFixed(2),
    String(p.orders), p.avg_order.toFixed(2), String(p.items),
  ]);
  return [head, ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n';
}

/** Time of day presets for the hours filter; null = all day. */
export const DAYPARTS: { key: string; label: string; from: number | null; to: number | null }[] = [
  { key: 'all', label: 'All day', from: null, to: null },
  { key: 'breakfast', label: 'Morning (6 AM – 11 AM)', from: 6, to: 10 },
  { key: 'lunch', label: 'Lunch (11 AM – 3 PM)', from: 11, to: 14 },
  { key: 'afternoon', label: 'Afternoon (3 PM – 6 PM)', from: 15, to: 17 },
  { key: 'evening', label: 'Evening (6 PM – 11 PM)', from: 18, to: 22 },
  { key: 'late', label: 'Late night (11 PM – 6 AM)', from: 23, to: 5 },
];
