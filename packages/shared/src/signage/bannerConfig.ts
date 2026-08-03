import type { SignageBannerItem, SignageBannerSettings } from './types';

const FIELD_ALLOW = new Set(['date', 'time', 'next_prayer', 'countdown']);

function uid(): string {
  return `bnr-${Math.random().toString(36).slice(2, 10)}`;
}

function clampSpeed(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 40;
  return Math.max(10, Math.min(180, Math.round(v)));
}

function clampDuration(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 30;
  return Math.max(5, Math.min(600, Math.round(v)));
}

function normalizeFields(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map(String) : [];
  const fields = list.filter((f) => FIELD_ALLOW.has(f));
  return fields.length > 0 ? fields : ['date', 'time', 'next_prayer', 'countdown'];
}

function normalizeItem(raw: Record<string, unknown>, fallbackIndex = 0): SignageBannerItem {
  const position = raw.position === 'top' ? 'top' : 'bottom';
  const custom = typeof raw.custom_text === 'string' ? raw.custom_text : '';
  return {
    id: String(raw.id || `legacy-${fallbackIndex}` || uid()),
    label: String(raw.label || `Banner ${fallbackIndex + 1}`),
    enabled: raw.enabled !== false,
    position,
    fields: normalizeFields(raw.fields),
    custom_text: custom,
    speed_seconds: clampSpeed(raw.speed_seconds),
    duration_seconds: clampDuration(raw.duration_seconds ?? 30),
  };
}

/**
 * Accept both the Stage-3 single-object shape and the Stage-4 `{ enabled, banners }` list.
 */
export function normalizeBannerSettings(raw: unknown): SignageBannerSettings {
  const cfg = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const masterEnabled = Boolean(cfg.enabled);

  if (Array.isArray(cfg.banners)) {
    const banners = cfg.banners
      .filter((b): b is Record<string, unknown> => Boolean(b) && typeof b === 'object')
      .map((b, i) => normalizeItem(b, i));
    return {
      enabled: masterEnabled,
      banners: banners.length > 0 ? banners : [normalizeItem({
        id: 'default',
        label: 'Prayer',
        enabled: true,
        position: 'bottom',
        fields: ['date', 'time', 'next_prayer', 'countdown'],
        speed_seconds: 40,
        duration_seconds: 30,
      })],
    };
  }

  // Legacy single banner → one-item list.
  const hasLegacy = 'position' in cfg || 'fields' in cfg || 'speed_seconds' in cfg || 'enabled' in cfg;
  if (hasLegacy) {
    return {
      enabled: masterEnabled,
      banners: [normalizeItem({
        id: 'legacy',
        label: 'Info',
        enabled: true,
        position: cfg.position,
        fields: cfg.fields,
        speed_seconds: cfg.speed_seconds,
        duration_seconds: 30,
      })],
    };
  }

  return {
    enabled: false,
    banners: [normalizeItem({
      id: 'default',
      label: 'Prayer',
      enabled: true,
      position: 'bottom',
      fields: ['date', 'time', 'next_prayer', 'countdown'],
      speed_seconds: 40,
      duration_seconds: 30,
    })],
  };
}

export function activeBanners(settings: SignageBannerSettings | null | undefined): SignageBannerItem[] {
  if (!settings?.enabled) return [];
  return (settings.banners ?? []).filter((b) => b.enabled);
}

export function newBannerItem(partial: Partial<SignageBannerItem> = {}): SignageBannerItem {
  return normalizeItem({
    id: uid(),
    label: 'New banner',
    enabled: true,
    position: 'bottom',
    fields: ['date', 'time', 'next_prayer', 'countdown'],
    speed_seconds: 40,
    duration_seconds: 30,
    ...partial,
  });
}
