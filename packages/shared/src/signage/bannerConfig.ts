import { scheduleMatches } from './scheduleMatches';
import type {
  SignageBannerAlign,
  SignageBannerDateFormat,
  SignageBannerDirection,
  SignageBannerItem,
  SignageBannerScrollMode,
  SignageBannerSettings,
  SignageSchedule,
} from './types';

const FIELD_ALLOW = new Set(['date', 'time', 'next_prayer', 'countdown', 'all_prayers']);
const DATE_FORMATS = new Set<SignageBannerDateFormat>(['full', 'short', 'numeric', 'weekday', 'hijri']);
const ALIGNS = new Set<SignageBannerAlign>(['left', 'center', 'right']);
const SCROLL_MODES = new Set<SignageBannerScrollMode>(['ticker', 'seamless', 'static']);
const DIRECTIONS = new Set<SignageBannerDirection>(['ltr', 'rtl']);

/** Stored speed_seconds floor/ceiling (presets sit inside this range). */
export const BANNER_SPEED_RANGE = { min: 5, max: 180 } as const;

/** Appearance defaults for normalized items. */
export const BANNER_APPEARANCE_DEFAULTS = {
  font_scale: 1,
  height_scale: 1,
  text_color: '#fff8f0',
  background_color: 'rgba(12, 8, 4, 0.78)',
  align: 'left' as SignageBannerAlign,
  /** Default for new items and for saves with no scroll_mode / scroll key. */
  scroll_mode: 'ticker' as SignageBannerScrollMode,
  direction: 'ltr' as SignageBannerDirection,
  date_format: 'full' as SignageBannerDateFormat,
  inset_percent: 0,
  repeat_count: 1,
};

/**
 * Outcome labels for the admin speed control.
 * Values stay in `speed_seconds` for compatibility; ticker/seamless
 * durations are derived from measured track width at runtime.
 */
export const BANNER_SPEED_PRESETS = [
  { label: 'Very slow', value: 90 },
  { label: 'Slow', value: 60 },
  { label: 'Medium', value: 40 },
  { label: 'Fast', value: 20 },
  { label: 'Very fast', value: 10 },
] as const;

export const BANNER_REPEAT_SLIDER = { min: 1, max: 20 } as const;

/** @deprecated duration no longer drives rotation. */
export const BANNER_DURATION_SLIDER = { min: 5, max: 120 } as const;

function uid(): string {
  return `bnr-${Math.random().toString(36).slice(2, 10)}`;
}

export function clampSpeed(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 40;
  return Math.max(BANNER_SPEED_RANGE.min, Math.min(BANNER_SPEED_RANGE.max, Math.round(v)));
}

function clampDuration(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 30;
  return Math.max(5, Math.min(600, Math.round(v)));
}

function clampRepeat(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.max(1, Math.min(20, Math.round(v)));
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

function normalizeSchedule(raw: unknown): SignageSchedule | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const hasAny = 'date_start' in s || 'date_end' in s || 'days' in s || 'windows' in s;
  if (!hasAny) return null;
  return {
    date_start: s.date_start != null ? String(s.date_start) : null,
    date_end: s.date_end != null ? String(s.date_end) : null,
    days: Array.isArray(s.days) ? s.days.map((d) => Number(d)) : null,
    windows: Array.isArray(s.windows)
      ? s.windows
        .filter((w): w is Record<string, unknown> => Boolean(w) && typeof w === 'object')
        .map((w) => ({ start: String(w.start ?? '00:00'), end: String(w.end ?? '23:59') }))
      : null,
  };
}

/**
 * Resolve scroll_mode. Explicit scroll_mode always wins.
 * Legacy scroll:false → static; scroll:true → seamless (pre-migration look).
 * Absent → BANNER_APPEARANCE_DEFAULTS.scroll_mode.
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
  const direction = String(raw.direction || BANNER_APPEARANCE_DEFAULTS.direction);
  return {
    id: String(raw.id || `legacy-${fallbackIndex}` || uid()),
    label: String(raw.label || `Banner ${fallbackIndex + 1}`),
    enabled: raw.enabled !== false,
    position,
    fields: normalizeFields(raw.fields),
    custom_text: custom,
    speed_seconds: clampSpeed(raw.speed_seconds),
    duration_seconds: clampDuration(raw.duration_seconds ?? 30),
    repeat_count: clampRepeat(raw.repeat_count ?? 1),
    font_scale: clampScale(raw.font_scale, BANNER_APPEARANCE_DEFAULTS.font_scale),
    height_scale: clampScale(raw.height_scale, BANNER_APPEARANCE_DEFAULTS.height_scale),
    text_color: normalizeColor(raw.text_color, BANNER_APPEARANCE_DEFAULTS.text_color),
    background_color: normalizeColor(raw.background_color, BANNER_APPEARANCE_DEFAULTS.background_color),
    align: (ALIGNS.has(align as SignageBannerAlign) ? align : BANNER_APPEARANCE_DEFAULTS.align),
    scroll_mode: normalizeScrollMode(raw),
    direction: (DIRECTIONS.has(direction as SignageBannerDirection)
      ? direction
      : BANNER_APPEARANCE_DEFAULTS.direction),
    date_format: (DATE_FORMATS.has(dateFormat as SignageBannerDateFormat)
      ? dateFormat
      : BANNER_APPEARANCE_DEFAULTS.date_format),
    inset_percent: clampInset(raw.inset_percent),
    schedule: normalizeSchedule(raw.schedule),
  };
}

export function normalizeBannerSettings(raw: unknown): SignageBannerSettings {
  const cfg = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const masterEnabled = Boolean(cfg.enabled);
  const showLogo = Boolean(cfg.show_logo_between);

  if (Array.isArray(cfg.banners)) {
    const banners = cfg.banners
      .filter((b): b is Record<string, unknown> => Boolean(b) && typeof b === 'object')
      .map((b, i) => normalizeItem(b, i));
    return {
      enabled: masterEnabled,
      show_logo_between: showLogo,
      banners: banners.length > 0 ? banners : [normalizeItem({
        id: 'default',
        label: 'Prayer',
        enabled: true,
        position: 'bottom',
        fields: ['date', 'time', 'next_prayer', 'countdown'],
        speed_seconds: 40,
        duration_seconds: 30,
        scroll_mode: BANNER_APPEARANCE_DEFAULTS.scroll_mode,
        repeat_count: 1,
      })],
    };
  }

  const hasLegacy = 'position' in cfg || 'fields' in cfg || 'speed_seconds' in cfg || 'enabled' in cfg;
  if (hasLegacy) {
    return {
      enabled: masterEnabled,
      show_logo_between: showLogo,
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
    show_logo_between: false,
    banners: [normalizeItem({
      id: 'default',
      label: 'Prayer',
      enabled: true,
      position: 'bottom',
      fields: ['date', 'time', 'next_prayer', 'countdown'],
      speed_seconds: 40,
      duration_seconds: 30,
      scroll_mode: BANNER_APPEARANCE_DEFAULTS.scroll_mode,
      repeat_count: 1,
    })],
  };
}

export function activeBanners(
  settings: SignageBannerSettings | null | undefined,
  now: Date = new Date(),
): SignageBannerItem[] {
  if (!settings?.enabled) return [];
  return (settings.banners ?? []).filter((b) => {
    if (!b.enabled) return false;
    return scheduleMatches(b.schedule, now);
  });
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
    scroll_mode: BANNER_APPEARANCE_DEFAULTS.scroll_mode,
    direction: BANNER_APPEARANCE_DEFAULTS.direction,
    repeat_count: 1,
    ...partial,
  });
}
