import { req } from './client';

/*
 * The complaint box. Owner, 2026-09-19: "i want a separate complaints option
 * not the one now used, because now complain is about the receipt". This is
 * the public form — staff, food, service — with or without a number.
 */

export type ComplaintBoxStatus = 'new' | 'in_progress' | 'resolved' | 'closed';

export type ComplaintBoxEvent = {
  id: number;
  type: 'status' | 'note' | 'sms';
  from_status: string | null;
  to_status: string | null;
  message: string | null;
  sms_status: string | null;
  created_at: string;
  user?: { id: number; name?: string | null } | null;
};

export type ComplaintBoxEntry = {
  id: number;
  reference_number: string;
  categories: string[];
  about_staff: string | null;
  comment: string | null;
  phone: string | null;
  is_anonymous: boolean;
  order_ref: string | null;
  visited_on: string | null;
  source: string;
  status: ComplaintBoxStatus;
  owner_alert_status: string;
  owner_alert_detail?: string | null;
  internal_note: string | null;
  last_message: string | null;
  last_message_at: string | null;
  taken_up_at: string | null;
  resolved_at: string | null;
  created_at: string;
  events?: ComplaintBoxEvent[];
  resolver?: { id: number; name?: string | null } | null;
};

export type ComplaintBoxMeta = {
  open_count: number;
  new_count: number;
  staff_open_count: number;
  this_week_count: number;
};

export async function fetchComplaintBox(params: { page?: number; status?: string; category?: string; search?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.status) qs.set('status', params.status);
  if (params.category) qs.set('category', params.category);
  if (params.search) qs.set('search', params.search);
  return req<{
    entries: { data: ComplaintBoxEntry[]; total: number; last_page: number; current_page: number };
    meta: ComplaintBoxMeta;
    categories: { value: string; label: string }[];
  }>(`/complaint-box?${qs}`);
}

export async function getComplaintBoxEntry(id: number) {
  return req<{ entry: ComplaintBoxEntry }>(`/complaint-box/${id}`);
}

export async function updateComplaintBoxStatus(
  id: number,
  body: { status: ComplaintBoxStatus; internal_note?: string; message?: string },
) {
  return req<{ entry: ComplaintBoxEntry }>(`/complaint-box/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function messageComplaintBoxCustomer(id: number, message: string) {
  return req<{ event: ComplaintBoxEvent; entry: ComplaintBoxEntry }>(`/complaint-box/${id}/message`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

/*
 * Phase B (owner, 2026-09-21): complaints per named staff member, and the
 * alert switches — a weekly summary text and a nudge for what sits unread.
 */
export type ComplaintStaffRow = {
  name: string;
  total: number;
  open: number;
  last_at: string | null;
  first_at: string | null;
  last_30_days: number;
  categories: Array<{ key: string; label: string; count: number }>;
  recent: Array<{ id: number; reference: string; status: ComplaintBoxStatus; created_at: string | null }>;
};

export async function fetchComplaintsByStaff(): Promise<{ staff: ComplaintStaffRow[]; unnamed: number }> {
  return req('/complaint-box/by-staff');
}

export type ComplaintAlertSettings = { weekly_sms: boolean; stale_sms: boolean; stale_days: number };

export async function getComplaintAlertSettings(): Promise<{ settings: ComplaintAlertSettings }> {
  return req('/complaint-box/alert-settings');
}

export async function updateComplaintAlertSettings(patch: Partial<ComplaintAlertSettings>): Promise<{ message: string; settings: ComplaintAlertSettings }> {
  return req('/complaint-box/alert-settings', { method: 'PATCH', body: JSON.stringify(patch) });
}
