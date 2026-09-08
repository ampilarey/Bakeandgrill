import { req } from './client';

/*
 * Production plan — owner, 2026-09-08: "for Friday evening we will need to
 * make 50 bajiya". Shapes mirror ProductionPlanController.
 */

export interface PlanSlotDef {
  key: string;
  label: string;
  from: number;
  to: number;
}

export interface PlanSettings {
  slots: { label: string; from: number; to: number }[];
  lookback_weeks: number;
  sample_weeks: number;
  default_service_level_pct: number;
}

export interface PlanSampleDay {
  date: string;
  qty: number;
  sold_out: boolean;
  sold_out_at: string | null;
  kinds: string[];
  position: string;
  factor: number;
  lifted_to: number | null;
}

export interface PlanSlotRow {
  label: string;
  forecast: number;
  planned: number;
  known: number;
  sold_out_days: number;
  sample: PlanSampleDay[];
  saved_planned: number | null;
  actual: number | null;
  actual_sold_out: boolean | null;
}

export interface PlanFactorMeta {
  days_seen: number;
  learned: number | null;
  index: number;
  expected?: number;
}

export interface PlanItem {
  key: string;
  item_id: number;
  variant_id: number;
  name: string;
  category: string | null;
  enabled: boolean;
  service_level_pct: number;
  round_to: number;
  min_qty: number;
  notes: string | null;
  factors: {
    day: number;
    month_position: Record<string, PlanFactorMeta>;
    calendar: Record<string, PlanFactorMeta>;
    weekday_mean: number;
  };
  slots: Record<string, PlanSlotRow>;
  day: {
    forecast: number;
    planned: number;
    sample_days: number;
    last_same_weekday: { date: string; qty: number } | null;
    known: number;
    made: number | null;
    actual: number | null;
    saved_planned: number | null;
  };
  customers: {
    registered_share_pct: number | null;
    buyers: number;
    regulars: number;
    regulars_weekly_qty: number;
    regulars_same_weekday_avg: number;
  };
}

export interface ProductionPlan {
  date: string;
  weekday: string;
  is_today: boolean;
  is_past: boolean;
  month_position: { key: string; label: string };
  calendar: { kind: string; label: string; expected_change_pct: number | null }[];
  closed: boolean;
  closed_reason: string | null;
  slots: PlanSlotDef[];
  settings: PlanSettings;
  history: { from: string; to: string; open_days: number; enough: boolean };
  items: PlanItem[];
}

export interface PlanCalendarPeriod {
  id: number;
  kind: string;
  kind_label: string;
  label: string | null;
  starts_on: string;
  ends_on: string;
  days: number;
  expected_change_pct: number | null;
  notes: string | null;
}

export interface PlanCalendar {
  from: string;
  to: string;
  periods: PlanCalendarPeriod[];
  closures: Record<string, string>;
  kinds: Record<string, string>;
}

export interface PlanCalendarInput {
  kind: string;
  label?: string | null;
  starts_on: string;
  ends_on: string;
  expected_change_pct?: number | null;
  notes?: string | null;
}

export interface PlanAccuracyRow {
  key?: string;
  name?: string;
  n: number;
  forecast: number;
  planned: number;
  actual: number;
  over: number;
  short: number;
  sold_out: number;
  enough: number;
  bias_pct: number | null;
  enough_pct: number | null;
  mean_abs_error: number | null;
}

export interface PlanAccuracy {
  weeks: number;
  from: string;
  to: string;
  days: number;
  totals: PlanAccuracyRow | null;
  items: PlanAccuracyRow[];
  records: {
    date: string;
    weekday: string;
    slot_label: string;
    slot_start: number;
    name: string;
    forecast: number;
    planned: number;
    actual: number;
    sold_out: boolean;
  }[];
}

export interface PlanCustomerHabits {
  weeks: number;
  from: string;
  to: string;
  orders: { total: number; registered: number; registered_share_pct: number | null };
  revenue: { total: number; registered: number; registered_share_pct: number | null };
  average_ticket: { registered: number | null; walk_in: number | null };
  buyers: { registered: number; repeat: number; repeat_share_pct: number | null; orders_per_buyer: number | null };
  by_weekday: { weekday: string; orders: number; registered_share_pct: number | null }[];
  by_slot: { key: string; label: string; orders: number; registered_share_pct: number | null }[];
  top_items: { key: string; name: string; qty: number; registered_share_pct: number; buyers: number; regulars: number }[];
}

export interface PlanCommitLine {
  item_id: number;
  variant_id: number;
  slot_start: number;
  slot_end: number;
  slot_label: string;
  forecast_qty: number;
  planned_qty: number;
}

export async function getProductionPlan(date?: string): Promise<ProductionPlan> {
  return req(`/production-plan${date ? `?date=${encodeURIComponent(date)}` : ''}`);
}

export async function getProductionPlanSettings(): Promise<{
  settings: PlanSettings;
  kinds: Record<string, string>;
  month_positions: Record<string, string>;
}> {
  return req('/production-plan/settings');
}

export async function updateProductionPlanSettings(data: Partial<PlanSettings>): Promise<{ settings: PlanSettings }> {
  return req('/production-plan/settings', { method: 'PUT', body: JSON.stringify(data) });
}

export async function updateProductionPlanItem(
  itemId: number,
  data: { variant_id?: number; enabled?: boolean; service_level_pct?: number; round_to?: number; min_qty?: number; notes?: string | null },
): Promise<{ item: { item_id: number; variant_id: number; enabled: boolean; service_level_pct: number; round_to: number; min_qty: number; notes: string | null } }> {
  return req(`/production-plan/items/${itemId}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function getProductionCalendar(from?: string, to?: string): Promise<PlanCalendar> {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const q = qs.toString();
  return req(`/production-plan/calendar${q ? `?${q}` : ''}`);
}

export async function createProductionCalendarPeriod(data: PlanCalendarInput): Promise<{ period: PlanCalendarPeriod }> {
  return req('/production-plan/calendar', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateProductionCalendarPeriod(id: number, data: Partial<PlanCalendarInput>): Promise<{ period: PlanCalendarPeriod }> {
  return req(`/production-plan/calendar/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteProductionCalendarPeriod(id: number): Promise<{ deleted: boolean }> {
  return req(`/production-plan/calendar/${id}`, { method: 'DELETE' });
}

export async function commitProductionPlan(date: string, lines: PlanCommitLine[]): Promise<{ date: string; saved: number }> {
  return req('/production-plan/commit', { method: 'POST', body: JSON.stringify({ date, lines }) });
}

export async function getProductionPlanAccuracy(weeks = 4): Promise<PlanAccuracy> {
  return req(`/production-plan/accuracy?weeks=${weeks}`);
}

export async function getPlanCustomerHabits(weeks = 8): Promise<PlanCustomerHabits> {
  return req(`/production-plan/customers?weeks=${weeks}`);
}
