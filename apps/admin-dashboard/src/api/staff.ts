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

export async function fetchSchedules(params?: {
  week?: string; staff_id?: number;
}): Promise<{ data: StaffSchedule[] }> {
  const qs = new URLSearchParams();
  if (params?.week)     qs.set('week', params.week);
  if (params?.staff_id) qs.set('staff_id', String(params.staff_id));
  return req(`/admin/schedules?${qs}`);
}

export async function createSchedule(data: {
  staff_id: number; date: string; start_time: string; end_time: string; notes?: string;
}): Promise<{ schedule: StaffSchedule }> {
  return req('/admin/schedules', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateSchedule(
  id: number,
  data: Partial<{ date: string; start_time: string; end_time: string; notes: string }>,
): Promise<{ schedule: StaffSchedule }> {
  return req(`/admin/schedules/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteSchedule(id: number): Promise<void> {
  await req(`/admin/schedules/${id}`, { method: 'DELETE' });
}

// ── Time Clock ────────────────────────────────────────────────────────────────

export interface TimeEntry {
  id: number;
  staff_id: number;
  staff?: { id: number; name: string };
  clocked_in_at: string;
  clocked_out_at: string | null;
  hours_worked: number | null;
  notes: string | null;
}

export async function getTimeClockStatus(): Promise<{ clocked_in: boolean; entry: TimeEntry | null }> {
  return req('/time-clock/status');
}

export async function clockIn(): Promise<{ entry: TimeEntry }> {
  return req('/time-clock/in', { method: 'POST' });
}

export async function clockOut(): Promise<{ entry: TimeEntry }> {
  return req('/time-clock/out', { method: 'POST' });
}

export async function getTimeClockHistory(params?: {
  staff_id?: number; from?: string; to?: string; page?: number;
}): Promise<{ data: TimeEntry[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.staff_id) qs.set('staff_id', String(params.staff_id));
  if (params?.from)     qs.set('from', params.from);
  if (params?.to)       qs.set('to', params.to);
  if (params?.page)     qs.set('page', String(params.page));
  return req(`/time-clock/history?${qs}`);
}

export async function getTimeClockSummary(params: {
  from: string; to: string;
}): Promise<{ data: Array<{ staff: { id: number; name: string }; total_hours: number; entries_count: number }> }> {
  const qs = new URLSearchParams({ from: params.from, to: params.to });
  return req(`/time-clock/summary?${qs}`);
}
