import { req } from './client';

/*
 * Admin → Telegram (owner, 2026-10-06: "Build owner bot now, then manager,
 * then staff"). Bots, who is linked, and how alerts use Telegram.
 * docs/TELEGRAM_BOTS.md.
 */

export type TelegramRole = 'owner' | 'manager' | 'staff' | 'kitchen_staff' | 'driver';

export type TelegramBot = {
  id: number;
  name: string;
  username: string | null;
  roles: TelegramRole[];
  is_enabled: boolean;
  linked_count: number;
  last_checked_at: string | null;
  last_error: string | null;
  token_hint: string | null;
};

export type TelegramPersonLink = {
  id: number;
  bot_id: number;
  telegram_username: string | null;
  telegram_name: string | null;
  linked_at: string | null;
  last_seen_at: string | null;
  blocked: boolean;
};

export type TelegramPerson = {
  kind: 'user' | 'driver';
  id: number;
  name: string;
  phone: string | null;
  role: TelegramRole | string;
  role_label: string;
  links: TelegramPersonLink[];
};

export type TelegramSettings = { alerts_enabled: boolean; day_report: boolean };

/** A shop group the bot posts online orders to (2026-10-07). */
export type TelegramGroup = {
  id: number;
  title: string;
  bot: { id: number; name: string; username: string | null } | null;
  feeds: string[];
  is_enabled: boolean;
  added_by: string | null;
  last_posted_at: string | null;
  last_error: string | null;
  created_at: string | null;
};

export type TelegramOverview = {
  bots: TelegramBot[];
  /** Missing from an older server. */
  groups?: TelegramGroup[];
  people: TelegramPerson[];
  roles: { key: TelegramRole; label: string }[];
  settings: TelegramSettings;
  webhook_base: string;
};

export function fetchTelegram() {
  return req<TelegramOverview>('/admin/telegram');
}

export function addTelegramBot(body: { name: string; token: string; roles: TelegramRole[]; take_over?: boolean }) {
  return req<{ bot: TelegramBot }>('/admin/telegram/bots', { method: 'POST', body: JSON.stringify(body) });
}

export function updateTelegramBot(id: number, body: { name?: string; roles?: TelegramRole[]; is_enabled?: boolean }) {
  return req<{ bot: TelegramBot }>(`/admin/telegram/bots/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function checkTelegramBot(id: number) {
  return req<{ ok: boolean; message: string; bot: TelegramBot }>(`/admin/telegram/bots/${id}/check`, { method: 'POST' });
}

export function reconnectTelegramBot(id: number) {
  return req<{ bot: TelegramBot; message: string }>(`/admin/telegram/bots/${id}/reconnect`, { method: 'POST' });
}

export function removeTelegramBot(id: number) {
  return req<{ ok: boolean }>(`/admin/telegram/bots/${id}`, { method: 'DELETE' });
}

export function makeTelegramLink(body: { bot_id: number; user_id?: number; driver_id?: number }) {
  return req<{ url: string | null; expires_at: string; minutes: number; bot_username: string }>('/admin/telegram/links/code', { method: 'POST', body: JSON.stringify(body) });
}

export function testTelegramLink(id: number) {
  return req<{ ok: boolean; message: string }>(`/admin/telegram/links/${id}/test`, { method: 'POST' });
}

export function unlinkTelegram(id: number) {
  return req<{ ok: boolean }>(`/admin/telegram/links/${id}`, { method: 'DELETE' });
}

export function updateTelegramSettings(body: Partial<TelegramSettings>) {
  return req<{ settings: TelegramSettings }>('/admin/telegram/settings', { method: 'PUT', body: JSON.stringify(body) });
}

export function updateTelegramGroup(id: number, body: { is_enabled?: boolean; feeds?: string[] }) {
  return req<{ group: TelegramGroup }>(`/admin/telegram/groups/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function testTelegramGroup(id: number) {
  return req<{ ok: boolean }>(`/admin/telegram/groups/${id}/test`, { method: 'POST' });
}

export function removeTelegramGroup(id: number) {
  return req<{ ok: boolean }>(`/admin/telegram/groups/${id}`, { method: 'DELETE' });
}
