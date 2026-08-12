/**
 * Mirror of online-order-web/src/utils/heroSlidePresentation.ts
 * and backend HeroSlides::presentation — keep in lockstep.
 */

export type HeroTextPosition = 'top' | 'middle' | 'bottom';

export const RESTAURANT_TIMEZONE = 'Indian/Maldives';

export type HeroBgToken = 'none' | 'dark' | 'light' | 'amber' | 'brand_dark' | 'glass';

export const HERO_BG_TOKEN_RGB: Record<'dark' | 'light' | 'amber' | 'brand_dark', string> = {
  dark: '28,20,8',
  light: '255,255,255',
  amber: '212,129,58',
  brand_dark: '45,26,10',
};

export const HERO_ELEMENT_KEYS = ['eyebrow', 'title', 'subtitle', 'cta1', 'cta2'] as const;
export type HeroElementKey = (typeof HERO_ELEMENT_KEYS)[number];

export type HeroElementBackground = {
  token: string | null;
  strength: number | null;
  full_width: boolean;
  css: string | null;
};

export type HeroSlidePresentation = {
  photo: number;
  scrim: number;
  text_position: HeroTextPosition;
  photo_brightness: number;
  text_background: number;
  elements: Record<HeroElementKey, HeroElementBackground>;
};

type SlideLike = {
  dim?: number | string;
  photo_brightness?: number | string;
  text_background?: number | string;
  text_position?: string;
  show_from?: string | null;
  show_until?: string | null;
  showing?: boolean;
  eyebrow_bg?: string | null;
  eyebrow_bg_strength?: number | string | null;
  title_bg?: string | null;
  title_bg_strength?: number | string | null;
  title_bg_full_width?: boolean | string | number | null;
  subtitle_bg?: string | null;
  subtitle_bg_strength?: number | string | null;
  subtitle_bg_full_width?: boolean | string | number | null;
  cta1_bg?: string | null;
  cta1_bg_strength?: number | string | null;
  cta2_bg?: string | null;
  cta2_bg_strength?: number | string | null;
};

function clamp100(n: number): number {
  if (!Number.isFinite(n)) return 100;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function hexToRgb(hex: string): string | null {
  const raw = hex.trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function truthyFlag(v: unknown): boolean {
  if (v === true || v === 1 || v === '1') return true;
  if (typeof v === 'string' && v.toLowerCase() === 'true') return true;
  return false;
}

function resolveElementBackground(slide: SlideLike | null | undefined, key: HeroElementKey): HeroElementBackground {
  const row = slide as Record<string, unknown> | null | undefined;
  const bgKey = `${key}_bg`;
  const strengthKey = `${key}_bg_strength`;
  const fullKey = `${key}_bg_full_width`;
  const raw = row?.[bgKey];
  const hasBg = raw !== undefined && raw !== null && String(raw).trim() !== '';
  if (!hasBg) {
    return { token: null, strength: null, full_width: false, css: null };
  }

  const token = String(raw).trim().toLowerCase();
  const strengthRaw = row?.[strengthKey];
  const hasStrength = strengthRaw !== undefined && strengthRaw !== null && strengthRaw !== '';
  const strength = hasStrength ? clamp100(Number(strengthRaw)) : 70;
  const full_width = key === 'title' || key === 'subtitle'
    ? truthyFlag(row?.[fullKey])
    : false;

  if (token === 'none') {
    return { token: 'none', strength, full_width, css: 'transparent' };
  }

  // Frosted glass — strength → white fill opacity (10 ≈ secondary CTA look).
  if (token === 'glass') {
    const alpha = Math.min(0.45, Math.max(0.02, strength / 100));
    return {
      token: 'glass',
      strength,
      full_width,
      css: `rgba(255,255,255,${alpha})`,
    };
  }

  let rgb: string | null = null;
  if (token in HERO_BG_TOKEN_RGB) {
    rgb = HERO_BG_TOKEN_RGB[token as keyof typeof HERO_BG_TOKEN_RGB];
  } else {
    rgb = hexToRgb(token.startsWith('#') ? token : `#${token}`);
  }
  if (!rgb) {
    return { token: null, strength: null, full_width: false, css: null };
  }

  const alpha = strength / 100;
  return {
    token,
    strength,
    full_width,
    css: `rgba(${rgb},${alpha})`,
  };
}

export function resolveHeroSlidePresentation(
  slide: SlideLike | Record<string, unknown> | null | undefined,
): HeroSlidePresentation {
  const row = (slide ?? null) as SlideLike | null;
  const hasPhoto = row != null && row.photo_brightness !== undefined && row.photo_brightness !== null && row.photo_brightness !== '';
  const hasScrim = row != null && row.text_background !== undefined && row.text_background !== null && row.text_background !== '';
  const hasDim = row != null && row.dim !== undefined && row.dim !== null && row.dim !== '';

  let photoBrightness = 0;
  let textBackground = 100;

  if (hasPhoto || hasScrim) {
    photoBrightness = hasPhoto ? clamp100(Number(row!.photo_brightness)) : 100;
    textBackground = hasScrim ? clamp100(Number(row!.text_background)) : 100;
  } else if (hasDim) {
    const dim = clamp100(Number(row!.dim));
    photoBrightness = 100 - dim;
    textBackground = dim;
  }

  const rawPos = String(row?.text_position ?? 'bottom').toLowerCase();
  const text_position: HeroTextPosition =
    rawPos === 'top' || rawPos === 'middle' || rawPos === 'bottom' ? rawPos : 'bottom';

  const elements = {} as Record<HeroElementKey, HeroElementBackground>;
  for (const key of HERO_ELEMENT_KEYS) {
    elements[key] = resolveElementBackground(row, key);
  }

  return {
    photo_brightness: photoBrightness,
    text_background: textBackground,
    photo: photoBrightness / 100,
    scrim: textBackground / 100,
    text_position,
    elements,
  };
}

export type HeroPresentationPatch = Partial<{
  photo_brightness: number;
  text_background: number;
  text_position: HeroTextPosition;
  eyebrow_bg: string | null;
  eyebrow_bg_strength: number | null;
  title_bg: string | null;
  title_bg_strength: number | null;
  title_bg_full_width: boolean | null;
  subtitle_bg: string | null;
  subtitle_bg_strength: number | null;
  subtitle_bg_full_width: boolean | null;
  cta1_bg: string | null;
  cta1_bg_strength: number | null;
  cta2_bg: string | null;
  cta2_bg_strength: number | null;
  show_from: string | null;
  show_until: string | null;
}>;

/** Persist new fields and drop legacy dim — one source of truth. */
export function withHeroPresentationFields<T extends Record<string, unknown>>(
  slide: T,
  patch: HeroPresentationPatch,
): T {
  const base = resolveHeroSlidePresentation(slide);
  const next: Record<string, unknown> = {
    ...slide,
    photo_brightness: patch.photo_brightness ?? base.photo_brightness,
    text_background: patch.text_background ?? base.text_background,
    text_position: patch.text_position ?? base.text_position,
  };
  delete next.dim;

  const applyNullable = (key: keyof HeroPresentationPatch, clearKeys?: string[]) => {
    if (!(key in patch)) return;
    const v = patch[key];
    if (v === null || v === '') {
      delete next[key as string];
      for (const ck of clearKeys ?? []) delete next[ck];
    } else {
      next[key as string] = v;
    }
  };

  applyNullable('eyebrow_bg', ['eyebrow_bg_strength']);
  applyNullable('eyebrow_bg_strength');
  applyNullable('title_bg', ['title_bg_strength', 'title_bg_full_width']);
  applyNullable('title_bg_strength');
  applyNullable('title_bg_full_width');
  applyNullable('subtitle_bg', ['subtitle_bg_strength', 'subtitle_bg_full_width']);
  applyNullable('subtitle_bg_strength');
  applyNullable('subtitle_bg_full_width');
  applyNullable('cta1_bg', ['cta1_bg_strength']);
  applyNullable('cta1_bg_strength');
  applyNullable('cta2_bg', ['cta2_bg_strength']);
  applyNullable('cta2_bg_strength');
  applyNullable('show_from');
  applyNullable('show_until');

  // Clearing a colour token should also drop strength when explicitly nulling bg.
  if (patch.eyebrow_bg === null) delete next.eyebrow_bg_strength;
  if (patch.title_bg === null) {
    delete next.title_bg_strength;
    delete next.title_bg_full_width;
  }
  if (patch.subtitle_bg === null) {
    delete next.subtitle_bg_strength;
    delete next.subtitle_bg_full_width;
  }
  if (patch.cta1_bg === null) delete next.cta1_bg_strength;
  if (patch.cta2_bg === null) delete next.cta2_bg_strength;

  return next as T;
}

export function restaurantLocalStamp(date: Date = new Date(), timeZone: string = RESTAURANT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`;
}

export function normalizeShowBound(raw: string, edge: 'from' | 'until'): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return edge === 'from' ? `${s}T00:00:00` : `${s}T23:59:59`;
  }
  const m = /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) {
    return `${m[1]}T${m[2]}:${m[3]}:${m[4] ?? '00'}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return restaurantLocalStamp(d);
}

export function isHeroSlideInScheduleWindow(
  slide: { show_from?: string | null; show_until?: string | null },
  now: Date = new Date(),
  timeZone: string = RESTAURANT_TIMEZONE,
): boolean {
  const fromRaw = String(slide.show_from ?? '').trim();
  const untilRaw = String(slide.show_until ?? '').trim();
  if (!fromRaw && !untilRaw) return true;

  const nowStamp = restaurantLocalStamp(now, timeZone);
  if (fromRaw) {
    const from = normalizeShowBound(fromRaw, 'from');
    if (from && nowStamp < from) return false;
  }
  if (untilRaw) {
    const until = normalizeShowBound(untilRaw, 'until');
    if (until && nowStamp > until) return false;
  }
  return true;
}

export function formatHeroSlideScheduleLabel(
  slide: { showing?: boolean; show_from?: string | null; show_until?: string | null },
  now: Date = new Date(),
): string {
  if (slide.showing === false) return 'Hidden — dates ignored while Hidden';
  const fromRaw = String(slide.show_from ?? '').trim();
  const untilRaw = String(slide.show_until ?? '').trim();
  if (!fromRaw && !untilRaw) return 'Always showing';

  const fmt = (raw: string, edge: 'from' | 'until') => {
    const stamp = normalizeShowBound(raw, edge);
    if (!stamp) return raw;
    const [datePart] = stamp.split('T');
    const d = new Date(`${datePart}T12:00:00Z`);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const inWindow = isHeroSlideInScheduleWindow(slide, now);
  if (fromRaw && untilRaw) {
    return inWindow
      ? `Showing ${fmt(fromRaw, 'from')} – ${fmt(untilRaw, 'until')}`
      : `Scheduled ${fmt(fromRaw, 'from')} – ${fmt(untilRaw, 'until')} (not live now)`;
  }
  if (fromRaw) {
    const from = normalizeShowBound(fromRaw, 'from');
    const nowStamp = restaurantLocalStamp(now);
    if (from && nowStamp < from) return `Starts ${fmt(fromRaw, 'from')}`;
    return `Showing since ${fmt(fromRaw, 'from')}`;
  }
  return `Showing until ${fmt(untilRaw, 'until')}`;
}
