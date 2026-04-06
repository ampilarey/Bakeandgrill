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
