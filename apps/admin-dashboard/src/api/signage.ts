import { req } from './client';

export type SignageBannerSettings = {
  enabled: boolean;
  position: 'top' | 'bottom' | string;
  fields: string[];
  speed_seconds: number;
};

export type SignageOverview = {
  playlists: SignagePlaylist[];
  groups: SignageGroup[];
  screens: SignageScreen[];
  campaigns: SignageCampaign[];
  emergency: string;
  prayer: { enabled: boolean; prayers: string[]; break_minutes: number };
  banner?: SignageBannerSettings;
  templates: Array<{ key: string; label: string }>;
  custom_templates: Array<{ key: string; label: string; slide: Record<string, unknown> }> | Record<string, unknown>;
  wifi: { name: string; password: string };
};

export type SignagePlaylist = {
  id: number;
  name: string;
  slides: unknown[];
  theme: Record<string, unknown> | null;
  is_active: boolean;
  store_id?: number | null;
};

export type SignageGroup = {
  id: number;
  name: string;
  playlist_id: number | null;
  theme: Record<string, unknown> | null;
  orientation: string;
  refresh_seconds: number;
  playlist?: { id: number; name: string } | null;
};

export type SignageScreen = {
  id: number;
  name: string;
  slug: string;
  group_id: number | null;
  playlist_id: number | null;
  orientation: string | null;
  resolution: string | null;
  refresh_seconds: number | null;
  is_default: boolean;
  group?: { id: number; name: string } | null;
  playlist?: { id: number; name: string } | null;
};

export type SignageCampaign = {
  id: number;
  name: string;
  playlist_id: number | null;
  slides: unknown[] | null;
  date_start: string | null;
  date_end: string | null;
  days: number[] | null;
  windows: Array<{ start: string; end: string }> | null;
  priority: number;
  is_active: boolean;
  store_id?: number | null;
};

export async function getSignageOverview(): Promise<SignageOverview> {
  return req<SignageOverview>('/admin/signage');
}

export async function updateSignagePlaylist(id: number, body: Partial<SignagePlaylist>) {
  return req<{ data: SignagePlaylist }>(`/admin/signage/playlists/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function createSignagePlaylist(body: Partial<SignagePlaylist>) {
  return req<{ data: SignagePlaylist }>('/admin/signage/playlists', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function createSignageGroup(body: Partial<SignageGroup>) {
  return req<{ data: SignageGroup }>('/admin/signage/groups', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateSignageGroup(id: number, body: Partial<SignageGroup>) {
  return req<{ data: SignageGroup }>(`/admin/signage/groups/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function createSignageScreen(body: Partial<SignageScreen> & { name: string }) {
  return req<{ data: SignageScreen }>('/admin/signage/screens', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateSignageScreen(id: number, body: Partial<SignageScreen>) {
  return req<{ data: SignageScreen }>(`/admin/signage/screens/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function createSignageCampaign(body: Partial<SignageCampaign> & { name: string }) {
  return req<{ data: SignageCampaign }>('/admin/signage/campaigns', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateSignageCampaign(id: number, body: Partial<SignageCampaign>) {
  return req<{ data: SignageCampaign }>(`/admin/signage/campaigns/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function setSignageEmergency(mode: string) {
  return req<{ mode: string }>('/admin/signage/emergency', {
    method: 'PUT',
    body: JSON.stringify({ mode }),
  });
}

export async function setSignagePrayer(body: { enabled: boolean; prayers?: string[]; break_minutes?: number }) {
  return req<{ prayer: SignageOverview['prayer'] }>('/admin/signage/prayer', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function setSignageBanner(body: Partial<SignageBannerSettings> & { enabled: boolean }) {
  return req<{ banner: SignageBannerSettings }>('/admin/signage/banner', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function buildSignageTemplate(key: string, opts: Record<string, unknown> = {}) {
  return req<{ slide: Record<string, unknown> }>('/admin/signage/templates/build', {
    method: 'POST',
    body: JSON.stringify({ key, opts }),
  });
}

export async function saveSignageCustomTemplate(key: string, label: string, slide: Record<string, unknown>) {
  return req<{ templates: unknown[] }>('/admin/signage/templates', {
    method: 'POST',
    body: JSON.stringify({ key, label, slide }),
  });
}

export type SignageDevice = {
  id: number;
  device_id: string;
  pairing_code: string | null;
  approved: boolean;
  screen_id: number | null;
  screen: { id: number; name: string; slug: string } | null;
  last_seen_at: string | null;
  online: boolean;
  meta: Record<string, unknown>;
  queued_command: { type?: string; payload?: unknown; queued_at?: string } | null;
  store_id?: number | null;
};

export async function fetchSignageDevices() {
  return req<{ data: SignageDevice[] }>('/admin/signage/devices');
}

export async function approveSignageDevice(id: number, body: { screen_id?: number | null; group_id?: number | null } = {}) {
  return req<{ data: SignageDevice }>(`/admin/signage/devices/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function commandSignageDevice(id: number, command: string, payload: Record<string, unknown> = {}) {
  return req<{ data: SignageDevice }>(`/admin/signage/devices/${id}/command`, {
    method: 'POST',
    body: JSON.stringify({ command, payload }),
  });
}
