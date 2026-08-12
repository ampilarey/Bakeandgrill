/**
 * Hero slide presentation — lockstep with backend HeroSlides::presentation
 * and website Blade CSS vars (--hero-photo / --hero-scrim).
 *
 * @see docs/HERO_READABILITY_PLAN.md §2.1 §2.2 §7
 */

export type HeroTextPosition = 'top' | 'middle' | 'bottom';

/** Restaurant wall-clock TZ — matches config('app.timezone') default. */
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
  /** Stored token or custom hex; null = absent → hardcoded CSS look. */
  token: string | null;
  strength: number | null;
  /** Title/subtitle only — full-width bar vs wrap-with-text. */
  full_width: boolean;
  /** Ready-to-paint CSS background, or null to leave stylesheet default. */
  css: string | null;
};

export type HeroSlidePresentation = {
  /** 0–1, 1 = full bright (no knock-back). */
  photo: number;
  /** 0–1, 1 = strong text copy-panel scrim. */
  scrim: number;
  text_position: HeroTextPosition;
  /** Admin / storage 0–100. */
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

/**
 * Resolve photo brightness + text background + position + per-element panels.
 * Legacy `dim` maps so the public look is unchanged for photo/scrim factors:
 *   photo_brightness = 100 - dim, text_background = dim.
 */
export function resolveHeroSlidePresentation(
  slide: SlideLike | Record<string, unknown> | null | undefined,
): HeroSlidePresentation {
  const row = (slide ?? null) as SlideLike | null;
  const hasPhoto = row != null && row.photo_brightness !== undefined && row.photo_brightness !== null && row.photo_brightness !== '';
  const hasScrim = row != null && row.text_background !== undefined && row.text_background !== null && row.text_background !== '';
  const hasDim = row != null && row.dim !== undefined && row.dim !== null && row.dim !== '';

  // Legacy implicit default was dim=100 (knocked-back photo + strong scrim).
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

/** Mobile media opacity — matches website .banner-slide img */
export function heroMediaOpacityMobile(photo: number): number {
  return 0.45 + 0.55 * photo;
}

/** Legacy mobile opacity from dim 0–100 (for identity asserts). */
export function legacyDimMediaOpacityMobile(dim: number): number {
  return 1 - 0.55 * (clamp100(dim) / 100);
}

/** Format restaurant-local stamp `YYYY-MM-DDTHH:mm:ss` for comparisons. */
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

/** Normalize slide bound to comparable restaurant-local stamp. */
export function normalizeShowBound(raw: string, edge: 'from' | 'until'): string | null {
  const s = raw.trim();
  if (!s) return null;
  // Date only
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return edge === 'from' ? `${s}T00:00:00` : `${s}T23:59:59`;
  }
  // datetime-local or ISO without seconds
  const m = /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) {
    return `${m[1]}T${m[2]}:${m[3]}:${m[4] ?? '00'}`;
  }
  // Fallback: Date parse then stamp in restaurant TZ
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return restaurantLocalStamp(d);
}

/**
 * Per-slide schedule window. Both empty = always.
 * Evaluated in restaurant timezone (not browser TZ, not forced UTC).
 */
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

/**
 * Split rich hero copy on <br> into non-empty line fragments.
 * Lockstep with HeroSlides::splitRichTextLines (kept for callers; outline mode no longer needs pills).
 */
export function splitHeroRichTextLines(html: string): string[] {
  const parts = html.split(/<br\s*\/?>/i);
  const lines = parts.filter((part) => {
    const text = part
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
    return text.length > 0;
  });
  if (lines.length === 0) return html !== '' ? [html] : [];
  return lines;
}

/** Plain-language schedule next to the Showing toggle. */
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
    return untilRaw ? `Showing until ${fmt(untilRaw, 'until')}` : `Showing since ${fmt(fromRaw, 'from')}`;
  }
  return `Showing until ${fmt(untilRaw, 'until')}`;
}
