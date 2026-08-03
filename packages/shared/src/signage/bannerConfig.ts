import type {
  SignageBannerAlign,
  SignageBannerDateFormat,
  SignageBannerItem,
  SignageBannerScrollMode,
  SignageBannerSettings,
} from './types';

const FIELD_ALLOW = new Set(['date', 'time', 'next_prayer', 'countdown']);
const DATE_FORMATS = new Set<SignageBannerDateFormat>(['full', 'short', 'numeric', 'weekday', 'hijri']);
const ALIGNS = new Set<SignageBannerAlign>(['left', 'center', 'right']);
const SCROLL_MODES = new Set<SignageBannerScrollMode>(['ticker', 'seamless', 'static']);

/** Defaults that match today's hardcoded CSS / date behaviour for migrated banners. */
export const BANNER_APPEARANCE_DEFAULTS = {
  font_scale: 1,
  height_scale: 1,
  text_color: '#fff8f0',
  background_color: 'rgba(12, 8, 4, 0.78)',
  align: 'left' as SignageBannerAlign,
  /** Migrated legacy default (old scroll: true). New banners use ticker via newBannerItem. */
  scroll_mode: 'seamless' as SignageBannerScrollMode,
  date_format: 'full' as SignageBannerDateFormat,
  inset_percent: 0,
};

/** Speed slider presets — stored as speed_seconds. */
export const BANNER_SPEED_PRESETS = [
  { label: 'Slow', value: 60 },
  { label: 'Medium', value: 40 },
  { label: 'Fast', value: 20 },
] as const;

export const BANNER_DURATION_SLIDER = { min: 5, max: 120 } as const;

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

function clampScale(n: unknown, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0.5, Math.min(3, Math.round(v * 100) / 100));
}

function clampInset(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(5, Math.round(v * 10) / 10));
}

function normalizeFields(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map(String) : [];
  const fields = list.filter((f) => FIELD_ALLOW.has(f));
  return fields.length > 0 ? fields : ['date', 'time', 'next_prayer', 'countdown'];
}

function normalizeColor(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const s = raw.trim();
  if (!s || s.length > 80) return fallback;
  if (/^#([0-9a-f]{3,8})$/i.test(s)) return s;
  if (/^(rgba?|hsla?)\(/i.test(s)) return s;
  if (/^[a-z]+$/i.test(s)) return s;
  return fallback;
}

/**
 * Resolve scroll_mode from new field or legacy `scroll` boolean.
 * Existing saves: scroll true/absent → seamless, scroll false → static.
 * Explicit scroll_mode always wins.
 */
export function normalizeScrollMode(raw: Record<string, unknown>): SignageBannerScrollMode {
  const mode = String(raw.scroll_mode || '');
  if (SCROLL_MODES.has(mode as SignageBannerScrollMode)) {
    return mode as SignageBannerScrollMode;
  }
  if ('scroll' in raw) {
    return raw.scroll === false ? 'static' : 'seamless';
  }
  return BANNER_APPEARANCE_DEFAULTS.scroll_mode;
}

function normalizeItem(raw: Record<string, unknown>, fallbackIndex = 0): SignageBannerItem {
  const position = raw.position === 'top' ? 'top' : 'bottom';
  const custom = typeof raw.custom_text === 'string' ? raw.custom_text : '';
  const dateFormat = String(raw.date_format || BANNER_APPEARANCE_DEFAULTS.date_format);
  const align = String(raw.align || BANNER_APPEARANCE_DEFAULTS.align);
  return {
    id: String(raw.id || `legacy-${fallbackIndex}` || uid()),
    label: String(raw.label || `Banner ${fallbackIndex + 1}`),
    enabled: raw.enabled !== false,
    position,
    fields: normalizeFields(raw.fields),
    custom_text: custom,
    speed_seconds: clampSpeed(raw.speed_seconds),
    duration_seconds: clampDuration(raw.duration_seconds ?? 30),
    font_scale: clampScale(raw.font_scale, BANNER_APPEARANCE_DEFAULTS.font_scale),
    height_scale: clampScale(raw.height_scale, BANNER_APPEARANCE_DEFAULTS.height_scale),
    text_color: normalizeColor(raw.text_color, BANNER_APPEARANCE_DEFAULTS.text_color),
    background_color: normalizeColor(raw.background_color, BANNER_APPEARANCE_DEFAULTS.background_color),
    align: (ALIGNS.has(align as SignageBannerAlign) ? align : BANNER_APPEARANCE_DEFAULTS.align),
    scroll_mode: normalizeScrollMode(raw),
    date_format: (DATE_FORMATS.has(dateFormat as SignageBannerDateFormat)
      ? dateFormat
      : BANNER_APPEARANCE_DEFAULTS.date_format),
    inset_percent: clampInset(raw.inset_percent),
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
        scroll_mode: 'ticker',
      })],
    };
  }

  // Legacy single banner → one-item list (migrates to seamless via absent scroll_mode).
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
      scroll_mode: 'ticker',
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
    scroll_mode: 'ticker',
    ...partial,
  });
}
