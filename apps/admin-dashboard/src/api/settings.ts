import { BASE, req } from './client';

// ── Site Settings ─────────────────────────────────────────────────────────────

export interface SiteSettingsGroup {
  [group: string]: { key: string; value: string | null; type: string; label: string; description: string | null }[];
}

export async function getSiteSettings(): Promise<{ settings: SiteSettingsGroup }> {
  return req('/site-settings');
}

export async function updateSiteSettings(settings: Record<string, string | null>): Promise<void> {
  await req('/site-settings', { method: 'PUT', body: JSON.stringify({ settings }) });
}

export async function uploadSiteLogo(key: string, file: File): Promise<{ url: string }> {
  const token = localStorage.getItem('admin_token');
  const form = new FormData();
  form.append('file', file);
  form.append('key', key);
  const res = await fetch(`${BASE}/site-settings/upload`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth_expired'));
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? `Upload failed (${res.status})`);
  }
  return res.json() as Promise<{ url: string }>;
}

// ── Online Ordering Gate ───────────────────────────────────────────────────────

export interface OnlineOrderingGateStatus {
  open: boolean;
  message: string;
  reason: string | null;
  master_switch: boolean;
  override_until: string | null;
  override_active: boolean;
  schedule_active: boolean;
  current_close: string | null;
  next_open_window: string | null;
}

export async function getOnlineOrderingStatus(): Promise<OnlineOrderingGateStatus> {
  return req('/ordering/status');
}

export async function toggleOnlineOrdering(enabled: boolean): Promise<{ online_ordering_enabled: boolean; status: OnlineOrderingGateStatus }> {
  return req('/admin/ordering/toggle', { method: 'POST', body: JSON.stringify({ enabled }) });
}

export async function setOnlineOrderingOverride(until: string | null): Promise<{ override_until: string | null }> {
  return req('/admin/ordering/override', { method: 'POST', body: JSON.stringify({ override_until: until }) });
}

export interface OnlineOrderingDayWindow {
  enabled: boolean;
  windows: { open: string; close: string }[];
}

export async function updateOnlineOrderingSchedule(
  schedule: Record<string, OnlineOrderingDayWindow> | null,
): Promise<{ online_ordering_schedule: unknown; status: OnlineOrderingGateStatus }> {
  return req('/admin/ordering/schedule', { method: 'PUT', body: JSON.stringify({ schedule }) });
}

// ── Delivery Gate ─────────────────────────────────────────────────────────────

export interface DeliveryGateStatus {
  delivery_open: boolean;
  message: string | null;
  accepting_flag: boolean;
  schedule_active: boolean;
  next_delivery_window: string | null;
}

export async function getDeliveryStatus(): Promise<DeliveryGateStatus> {
  return req('/ordering/delivery-status');
}

export async function toggleDelivery(enabled: boolean): Promise<{ delivery_accepting_orders: boolean; delivery_status: DeliveryGateStatus }> {
  return req('/admin/ordering/delivery-toggle', { method: 'POST', body: JSON.stringify({ enabled }) });
}

export interface DeliveryDayWindow {
  enabled: boolean;
  windows: { open: string; close: string }[];
}

export async function updateDeliverySchedule(
  schedule: Record<string, DeliveryDayWindow> | null,
): Promise<{ delivery_schedule: unknown; delivery_status: DeliveryGateStatus }> {
  return req('/admin/ordering/delivery-schedule', { method: 'PUT', body: JSON.stringify({ schedule }) });
}

// ── Permissions ───────────────────────────────────────────────────────────────

export interface PermissionItem {
  slug: string; name: string; group: string; granted: boolean; source: 'owner' | 'role' | 'override';
}

// ── Webhooks ──────────────────────────────────────────────────────────────────

export type WebhookSubscription = {
  id: number;
  name: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  failure_count: number;
  last_triggered_at: string | null;
  disabled_at: string | null;
  created_at: string;
};

export type WebhookLog = {
  id: number;
  url: string;
  event: string;
  response_code: number | null;
  status: 'delivered' | 'failed';
  created_at: string;
};

export async function fetchWebhooks(): Promise<{ subscriptions: WebhookSubscription[] }> {
  return req('/webhooks');
}

export async function createWebhook(data: { name: string; url: string; events: string[] }): Promise<{ subscription: WebhookSubscription }> {
  return req('/webhooks', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateWebhook(id: number, data: Partial<{ name: string; url: string; events: string[]; active: boolean }>): Promise<{ subscription: WebhookSubscription }> {
  return req(`/webhooks/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteWebhook(id: number): Promise<void> {
  await req(`/webhooks/${id}`, { method: 'DELETE' });
}

export async function rotateWebhookSecret(id: number): Promise<{ secret: string }> {
  return req(`/webhooks/${id}/rotate-secret`, { method: 'POST' });
}

export async function fetchWebhookLogs(id: number): Promise<{ data: WebhookLog[]; total: number }> {
  return req(`/webhooks/${id}/logs`);
}

export async function fetchSupportedWebhookEvents(): Promise<{ events: string[] }> {
  return req('/webhooks/events');
}

export async function getWebhook(id: number): Promise<{ subscription: WebhookSubscription }> {
  return req(`/webhooks/${id}`);
}
