import { req } from './client';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SmsContact = {
  id: number;
  name: string;
  phone: string;
  type: 'staff' | 'external';
  user_id: number | null;
  user_name: string | null;
  is_enabled: boolean;
  tags: string[];
  active_days: string[] | null;
  active_from: string | null;
  active_until: string | null;
  notes: string | null;
  created_at: string;
};

export type SmsContactGroup = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  is_enabled: boolean;
  contacts_count: number;
  contacts: { id: number; name: string; phone: string; type: string }[];
  created_at: string;
};

export type SmsTemplate = {
  id: number;
  name: string;
  slug: string;
  body: string;
  type: 'order_notification' | 'schedule_reminder' | 'duty_reminder' | 'custom';
  description: string | null;
  is_system: boolean;
  variables: { name: string; description: string }[];
  created_at: string;
};

export type SmsScheduledMessage = {
  id: number;
  name: string;
  to_type: 'contact' | 'group' | 'phone';
  to_contact_id: number | null;
  to_contact_name: string | null;
  to_group_id: number | null;
  to_group_name: string | null;
  to_phone: string | null;
  template_id: number | null;
  template_name: string | null;
  body: string | null;
  variables: Record<string, string> | null;
  is_recurring: boolean;
  recurrence_type: 'daily' | 'weekly' | 'monthly' | null;
  recurrence_days: string[] | null;
  recurrence_time: string | null;
  recurrence_day_of_month: number | null;
  send_at: string | null;
  next_send_at: string | null;
  last_sent_at: string | null;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  created_by_name: string | null;
  created_at: string;
};

export type StaffNotificationPref = {
  user_id: number;
  notifications_enabled: boolean;
  order_types: string[] | null;
  menu_group_ids: number[] | null;
  category_ids: number[] | null;
  is_fallback: boolean;
  fallback_priority: number;
};

export type StaffNotificationLog = {
  id: number;
  order_id: number;
  order_number: string | null;
  order_type: string | null;
  event_type: string;
  recipient_type: string;
  recipient_id: number | null;
  phone: string;
  message: string;
  status: 'queued' | 'sent' | 'failed';
  fallback_used: boolean;
  sms_log_id: number | null;
  sent_at: string | null;
  failed_at: string | null;
  created_at: string;
};

// ── Contacts ──────────────────────────────────────────────────────────────────

export async function fetchSmsContacts(): Promise<{ contacts: SmsContact[] }> {
  return req('/admin/sms/contacts');
}

export async function createSmsContact(data: {
  name: string; phone: string; type: 'staff' | 'external';
  user_id?: number | null; is_enabled?: boolean;
  tags?: string[]; active_days?: string[] | null;
  active_from?: string | null; active_until?: string | null; notes?: string;
}): Promise<{ contact: SmsContact }> {
  return req('/admin/sms/contacts', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateSmsContact(id: number, data: Partial<{
  name: string; phone: string; type: 'staff' | 'external';
  user_id: number | null; is_enabled: boolean;
  tags: string[]; active_days: string[] | null;
  active_from: string | null; active_until: string | null; notes: string;
}>): Promise<{ contact: SmsContact }> {
  return req(`/admin/sms/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteSmsContact(id: number): Promise<void> {
  await req(`/admin/sms/contacts/${id}`, { method: 'DELETE' });
}

// ── Contact Groups ────────────────────────────────────────────────────────────

export async function fetchSmsContactGroups(): Promise<{ groups: SmsContactGroup[] }> {
  return req('/admin/sms/contact-groups');
}

export async function createSmsContactGroup(data: {
  name: string; description?: string; is_enabled?: boolean;
}): Promise<{ group: SmsContactGroup }> {
  return req('/admin/sms/contact-groups', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateSmsContactGroup(id: number, data: Partial<{
  name: string; description: string; is_enabled: boolean;
}>): Promise<{ group: SmsContactGroup }> {
  return req(`/admin/sms/contact-groups/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteSmsContactGroup(id: number): Promise<void> {
  await req(`/admin/sms/contact-groups/${id}`, { method: 'DELETE' });
}

export async function addGroupMember(groupId: number, contactId: number): Promise<void> {
  await req(`/admin/sms/contact-groups/${groupId}/members`, {
    method: 'POST',
    body: JSON.stringify({ contact_id: contactId }),
  });
}

export async function removeGroupMember(groupId: number, contactId: number): Promise<void> {
  await req(`/admin/sms/contact-groups/${groupId}/members/${contactId}`, { method: 'DELETE' });
}

// ── Templates ─────────────────────────────────────────────────────────────────

export async function fetchSmsTemplates(): Promise<{ templates: SmsTemplate[] }> {
  return req('/admin/sms/templates');
}

export async function createSmsTemplate(data: {
  name: string; body: string;
  type: 'order_notification' | 'schedule_reminder' | 'duty_reminder' | 'custom';
  description?: string;
}): Promise<{ template: SmsTemplate }> {
  return req('/admin/sms/templates', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateSmsTemplate(id: number, data: Partial<{
  name: string; body: string;
  type: 'order_notification' | 'schedule_reminder' | 'duty_reminder' | 'custom';
  description: string;
}>): Promise<{ template: SmsTemplate }> {
  return req(`/admin/sms/templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteSmsTemplate(id: number): Promise<void> {
  await req(`/admin/sms/templates/${id}`, { method: 'DELETE' });
}

export async function previewSmsTemplateById(id: number): Promise<{ preview: string; variables: string[] }> {
  return req(`/admin/sms/templates/${id}/preview`, { method: 'POST' });
}

// ── Scheduled Messages ────────────────────────────────────────────────────────

export async function fetchSmsScheduled(params?: { page?: number }): Promise<{
  data: SmsScheduledMessage[];
  meta: { total: number; last_page: number };
}> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  return req(`/admin/sms/scheduled?${qs}`);
}

export async function createSmsScheduled(data: {
  name: string;
  to_type: 'contact' | 'group' | 'phone';
  to_contact_id?: number | null;
  to_group_id?: number | null;
  to_phone?: string | null;
  template_id?: number | null;
  body?: string | null;
  variables?: Record<string, string>;
  is_recurring: boolean;
  recurrence_type?: 'daily' | 'weekly' | 'monthly' | null;
  recurrence_days?: string[] | null;
  recurrence_time?: string | null;
  recurrence_day_of_month?: number | null;
  send_at?: string | null;
}): Promise<{ message: SmsScheduledMessage }> {
  return req('/admin/sms/scheduled', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateSmsScheduled(id: number, data: Partial<Parameters<typeof createSmsScheduled>[0]>): Promise<{ message: SmsScheduledMessage }> {
  return req(`/admin/sms/scheduled/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function cancelSmsScheduled(id: number): Promise<void> {
  await req(`/admin/sms/scheduled/${id}`, { method: 'DELETE' });
}

export async function pauseSmsScheduled(id: number): Promise<void> {
  await req(`/admin/sms/scheduled/${id}/pause`, { method: 'POST' });
}

export async function resumeSmsScheduled(id: number): Promise<void> {
  await req(`/admin/sms/scheduled/${id}/resume`, { method: 'POST' });
}

// ── Staff Notification Prefs ──────────────────────────────────────────────────

export async function getStaffNotificationPrefs(userId: number): Promise<{ prefs: StaffNotificationPref }> {
  return req(`/admin/staff/${userId}/notification-prefs`);
}

export async function updateStaffNotificationPrefs(
  userId: number,
  data: Partial<{
    notifications_enabled: boolean;
    order_types: string[] | null;
    menu_group_ids: number[] | null;
    category_ids: number[] | null;
    is_fallback: boolean;
    fallback_priority: number;
  }>
): Promise<{ prefs: StaffNotificationPref }> {
  return req(`/admin/staff/${userId}/notification-prefs`, { method: 'PUT', body: JSON.stringify(data) });
}

// ── Staff Notification Logs ───────────────────────────────────────────────────

export async function fetchStaffNotificationLogs(params?: {
  order_id?: number; event_type?: string; status?: string; page?: number;
}): Promise<{ data: StaffNotificationLog[]; meta: { total: number; last_page: number } }> {
  const qs = new URLSearchParams();
  if (params?.order_id)   qs.set('order_id', String(params.order_id));
  if (params?.event_type) qs.set('event_type', params.event_type);
  if (params?.status)     qs.set('status', params.status);
  if (params?.page)       qs.set('page', String(params.page));
  return req(`/admin/sms/staff-logs?${qs}`);
}

export async function resendStaffNotification(id: number): Promise<{ message: string; log: StaffNotificationLog }> {
  return req(`/admin/sms/staff-logs/${id}/resend`, { method: 'POST' });
}
