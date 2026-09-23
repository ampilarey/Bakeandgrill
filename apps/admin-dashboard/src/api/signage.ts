import { req } from './client';

export type SignageBannerDateFormat = 'full' | 'short' | 'numeric' | 'weekday' | 'hijri';
export type SignageBannerAlign = 'left' | 'center' | 'right';
export type SignageBannerScrollMode = 'ticker' | 'seamless' | 'static';
export type SignageBannerDirection = 'ltr' | 'rtl';

export type SignageSchedule = {
  date_start?: string | null;
  date_end?: string | null;
  days?: number[] | null;
  windows?: Array<{ start: string; end: string }> | null;
};

export type SignageBannerItem = {
  id: string;
  label: string;
  enabled: boolean;
  position: 'top' | 'bottom' | string;
  fields: string[];
  custom_text?: string;
  speed_seconds: number;
  duration_seconds: number;
  repeat_count: number;
  font_scale: number;
  height_scale: number;
  text_color: string;
  background_color: string;
  align: SignageBannerAlign | string;
  scroll_mode: SignageBannerScrollMode | string;
  direction: SignageBannerDirection | string;
  date_format: SignageBannerDateFormat | string;
  inset_percent: number;
  schedule?: SignageSchedule | null;
};

export type SignageBannerSettings = {
  enabled: boolean;
  banners: SignageBannerItem[];
  show_logo_between?: boolean;
  /** @deprecated Stage-3 single-banner fields — still accepted on read. */
  position?: 'top' | 'bottom' | string;
  fields?: string[];
  speed_seconds?: number;
};

export type SignageEmergencyLayout = 'notice' | 'alert' | 'split' | 'countdown' | 'full_bleed';
export type SignageEmergencyMediaType = 'none' | 'image' | 'video' | 'icon';

export type SignageEmergencyEntry = {
  id: string;
  mode: string;
  priority: number;
  is_active: boolean;
  layout: SignageEmergencyLayout | string;
  title: string;
  body: string;
  title_dv?: string;
  body_dv?: string;
  reopen_at?: string | null;
  schedule?: SignageSchedule | null;
  media_type?: SignageEmergencyMediaType | string;
  media_url?: string;
  icon?: string;
};

export type SignageEmergencyConfig = {
  manual: string;
  entries: SignageEmergencyEntry[];
};

export type SignagePrayerIsland = {
  id: number;
  label: string;
  atoll: string;
};

export type SignageOverview = {
  playlists: SignagePlaylist[];
  groups: SignageGroup[];
  screens: SignageScreen[];
  campaigns: SignageCampaign[];
  emergency: SignageEmergencyConfig | string;
  prayer: { enabled: boolean; prayers: string[]; break_minutes: number; island_id?: number };
  prayer_islands?: SignagePrayerIsland[];
  banner?: SignageBannerSettings;
  templates: Array<{ key: string; label: string }>;
  custom_templates: Array<{ key: string; label: string; slide: Record<string, unknown> }> | Record<string, unknown>;
  wifi: { name: string; password: string };
  notices?: SignageNotice[];
  settings?: SignageBoardSettings;
};

/** A quick notice on the board — a slide, a ticker line, or both; gone by itself. */
export type SignageNotice = {
  id: string;
  text: string;
  text_dv: string;
  look: 'info' | 'warning' | 'celebrate' | string;
  show: 'ticker' | 'slide' | 'both' | string;
  seconds: number;
  created_at: string;
  expires_at: string | null;
};

export type SignageBoardSettings = { sold_out_badge_minutes: number };

export async function postSignageNotice(body: {
  text: string;
  text_dv?: string;
  look?: string;
  show?: string;
  seconds?: number;
  minutes?: number;
}) {
  return req<{ data: SignageNotice; notices: SignageNotice[] }>('/admin/signage/notices', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteSignageNotice(id: string) {
  return req<{ ok: boolean; notices: SignageNotice[] }>(`/admin/signage/notices/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function setSignageBoardSettings(body: Partial<SignageBoardSettings>) {
  return req<{ settings: SignageBoardSettings }>('/admin/signage/settings', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export type SignagePlaylist = {
  id: number;
  name: string;
  slides: unknown[];
  theme: Record<string, unknown> | null;
  is_active: boolean;
  store_id?: number | null;
};

/** A screen's or group's look — see packages/shared/src/signage/layout.ts. */
export type SignageLayoutBag = {
  preset?: string;
  columns?: number;
  rows_per_slide?: number;
  show_thumbs?: boolean;
  showcase_cap?: number;
  card_style?: 'split' | 'stack';
  category_ids?: number[];
  dhivehi_first?: boolean;
  dayparts?: SignageDaypartBag[];
  sleep?: SignageSleepBag | null;
};

export type SignageDaypartBag = {
  id: string;
  label: string;
  category_ids: number[];
  preset?: string | null;
  schedule?: { days?: number[] | null; windows?: Array<{ start: string; end: string }> | null } | null;
};

export type SignageSleepBag = {
  enabled: boolean;
  off: string;
  on: string;
  days?: number[] | null;
};

export type SignageGroup = {
  id: number;
  name: string;
  playlist_id: number | null;
  theme: Record<string, unknown> | null;
  layout?: SignageLayoutBag | null;
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
  overrides?: Record<string, unknown> | null;
  layout?: SignageLayoutBag | null;
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
  return req<SignageEmergencyConfig>('/admin/signage/emergency', {
    method: 'PUT',
    body: JSON.stringify({ mode }),
  });
}

export async function setSignageEmergencyConfig(body: {
  mode?: string;
  entries?: SignageEmergencyEntry[];
}) {
  return req<SignageEmergencyConfig>('/admin/signage/emergency', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function setSignagePrayer(body: {
  enabled: boolean;
  prayers?: string[];
  break_minutes?: number;
  island_id?: number;
}) {
  return req<{ prayer: SignageOverview['prayer'] }>('/admin/signage/prayer', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function setSignageBanner(body: {
  enabled: boolean;
  banners?: SignageBannerItem[];
  show_logo_between?: boolean;
  /** Legacy Stage-3 fields still accepted by the API. */
  position?: 'top' | 'bottom' | string;
  fields?: string[];
  speed_seconds?: number;
}) {
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
