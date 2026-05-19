import { req } from './client';
import type { PermissionItem } from './settings';

export type StaffMember = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string | null;
  role_name: string | null;
  role_id: number | null;
  is_active: boolean;
  has_pin: boolean;
  last_login_at: string | null;
  created_at: string;
};

export type StaffRole = { id: number; name: string; slug: string };

export async function fetchStaff(): Promise<{ staff: StaffMember[]; roles: StaffRole[] }> {
  return req('/admin/staff');
}

export async function createStaff(data: {
  name: string;
  email: string;
  role_id: number;
  pin: string;
}): Promise<{ staff: StaffMember }> {
  return req('/admin/staff', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateStaff(
  id: number,
  data: { name?: string; email?: string; role_id?: number; is_active?: boolean; phone?: string | null }
): Promise<{ staff: StaffMember }> {
  return req(`/admin/staff/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function resetStaffPin(id: number, pin: string): Promise<void> {
  await req(`/admin/staff/${id}/pin`, { method: 'POST', body: JSON.stringify({ pin }) });
}

export async function deleteStaff(id: number): Promise<void> {
  await req(`/admin/staff/${id}`, { method: 'DELETE' });
}

export async function getAllPermissions(): Promise<{ permissions: Record<string, { id: number; slug: string; name: string }[]> }> {
  return req('/permissions');
}

export async function getUserPermissions(userId: number): Promise<{ user_id: number; name: string; role: string; permissions: PermissionItem[] }> {
  return req(`/users/${userId}/permissions`);
}

export async function updateUserPermissions(userId: number, permissions: Record<string, boolean | null>): Promise<void> {
  await req(`/users/${userId}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions }) });
}

// ── Staff Schedules ───────────────────────────────────────────────────────────
//
// Backend (ScheduleController) speaks `user_id` / `shift_start` / `shift_end`
// / `res.schedules`. The admin UI was built against the older `staff_id` /
// `start_time` / `end_time` / `res.data` shape. Rather than rewriting the
// pages, we translate at this boundary so both sides stay readable.

export interface StaffSchedule {
  id: number;
  staff_id: number;
  staff?: { id: number; name: string };
  date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  created_at: string;
}

interface BackendScheduleRow {
  id: number;
  user_id: number;
  user_name?: string | null;
  date: string;
  shift_start: string;
  shift_end: string;
  notes?: string | null;
  role_override?: string | null;
  is_confirmed?: boolean;
}

function mapSchedule(r: BackendScheduleRow): StaffSchedule {
  return {
    id: r.id,
    staff_id: r.user_id,
    staff: r.user_name ? { id: r.user_id, name: r.user_name } : undefined,
    date: r.date,
    start_time: r.shift_start,
    end_time: r.shift_end,
    notes: r.notes ?? null,
    created_at: '',
  };
}

export async function fetchSchedules(params?: {
  week?: string; staff_id?: number;
}): Promise<{ data: StaffSchedule[] }> {
  const qs = new URLSearchParams();
  if (params?.week)     qs.set('week', params.week);
  if (params?.staff_id) qs.set('staff_id', String(params.staff_id));
  const res = await req<{ schedules: BackendScheduleRow[] }>(`/admin/schedules?${qs}`);
  return { data: (res.schedules ?? []).map(mapSchedule) };
}

export async function createSchedule(data: {
  staff_id: number; date: string; start_time: string; end_time: string; notes?: string;
}): Promise<{ schedule: StaffSchedule }> {
  const res = await req<{ schedule: BackendScheduleRow }>('/admin/schedules', {
    method: 'POST',
    body: JSON.stringify({
      user_id: data.staff_id,
      date: data.date,
      shift_start: data.start_time,
      shift_end: data.end_time,
      notes: data.notes,
    }),
  });
  return { schedule: mapSchedule(res.schedule) };
}

export async function updateSchedule(
  id: number,
  data: Partial<{ date: string; start_time: string; end_time: string; notes: string }>,
): Promise<{ schedule: StaffSchedule }> {
  const body: Record<string, unknown> = {};
  if (data.start_time !== undefined) body.shift_start = data.start_time;
  if (data.end_time !== undefined)   body.shift_end = data.end_time;
  if (data.notes !== undefined)      body.notes = data.notes;
  const res = await req<{ schedule: BackendScheduleRow }>(`/admin/schedules/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return { schedule: mapSchedule(res.schedule) };
}

export async function deleteSchedule(id: number): Promise<void> {
  await req(`/admin/schedules/${id}`, { method: 'DELETE' });
}

// ── Time Clock ────────────────────────────────────────────────────────────────
//
// Backend (TimeClockController) returns `{ punch }` shaped rows with
// `user_id`, `clocked_in_at`, `clocked_out_at`, `total_hours`. The UI was
// designed around `entry` / `staff` / `hours_worked`. Translate here so the
// page can stay untouched and the next backend tweak only needs to update
// one mapper.

export interface TimeEntry {
  id: number;
  staff_id: number;
  staff?: { id: number; name: string };
  clocked_in_at: string;
  clocked_out_at: string | null;
  hours_worked: number | null;
  notes: string | null;
}

interface BackendPunchRow {
  id: number;
  user_id: number;
  user?: { id: number; name: string } | null;
  clocked_in_at: string;
  clocked_out_at: string | null;
  total_hours?: number | string | null;
  hours_worked?: number | string | null;
  notes?: string | null;
}

function mapPunch(p: BackendPunchRow | null | undefined): TimeEntry | null {
  if (!p) return null;
  const hours = p.total_hours ?? p.hours_worked;
  return {
    id: p.id,
    staff_id: p.user_id,
    staff: p.user ? { id: p.user.id, name: p.user.name } : undefined,
    clocked_in_at: p.clocked_in_at,
    clocked_out_at: p.clocked_out_at,
    hours_worked: hours == null ? null : Number(hours),
    notes: p.notes ?? null,
  };
}

export async function getTimeClockStatus(): Promise<{ clocked_in: boolean; entry: TimeEntry | null }> {
  const res = await req<{ punch: BackendPunchRow | null }>('/time-clock/status');
  const entry = mapPunch(res.punch);
  return { clocked_in: entry !== null && !entry.clocked_out_at, entry };
}

export async function clockIn(): Promise<{ entry: TimeEntry }> {
  const res = await req<{ punch: BackendPunchRow }>('/time-clock/in', { method: 'POST' });
  return { entry: mapPunch(res.punch)! };
}

export async function clockOut(): Promise<{ entry: TimeEntry }> {
  const res = await req<{ punch: BackendPunchRow }>('/time-clock/out', { method: 'POST' });
  return { entry: mapPunch(res.punch)! };
}

export async function getTimeClockHistory(params?: {
  staff_id?: number; from?: string; to?: string; page?: number;
}): Promise<{ data: TimeEntry[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.staff_id) qs.set('staff_id', String(params.staff_id));
  if (params?.from)     qs.set('from', params.from);
  if (params?.to)       qs.set('to', params.to);
  if (params?.page)     qs.set('page', String(params.page));
  const res = await req<{
    data: BackendPunchRow[];
    meta: { current_page: number; last_page: number; total: number };
  }>(`/time-clock/history?${qs}`);
  return {
    data: (res.data ?? []).map((row) => mapPunch(row)!),
    meta: res.meta,
  };
}

export async function getTimeClockSummary(params: {
  from: string; to: string;
}): Promise<{ data: Array<{ staff: { id: number; name: string }; total_hours: number; entries_count: number }> }> {
  const qs = new URLSearchParams({ from: params.from, to: params.to });
  const res = await req<{
    from: string;
    to: string;
    summary: Array<{ user_id: number; user_name: string; punch_count: number; total_hours: number }>;
  }>(`/time-clock/summary?${qs}`);
  return {
    data: (res.summary ?? []).map((row) => ({
      staff: { id: row.user_id, name: row.user_name },
      total_hours: Number(row.total_hours ?? 0),
      entries_count: row.punch_count,
    })),
  };
}
