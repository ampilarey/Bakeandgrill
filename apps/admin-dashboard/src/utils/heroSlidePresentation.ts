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
  /** How the background is drawn: per line, one box, full-width bar, or outline only. */
  shape: HeroBgShape;
  css: string | null;
};

/** Owner control for the shade behind the whole text block. */
export type HeroCopyScrimMode = 'auto' | 'always' | 'off';

export type HeroSlidePresentation = {
  photo: number;
  scrim: number;
  text_position: HeroTextPosition;
  photo_brightness: number;
  text_background: number;
  elements: Record<HeroElementKey, HeroElementBackground>;
  /** Heading or subheading carries its own panel. */
  panelled: boolean;
  /** Owner's choice for the shade behind the whole text block. */
  copy_scrim_mode: HeroCopyScrimMode;
  /** Resolved: whether that shade is actually painted. */
  copy_scrim: boolean;
  /** Colours, outlines, borders, geometry and type for heading and subheading. */
  styles: Record<HeroStyledKey, HeroElementStyle>;
  /** Slide-level horizontal alignment for the copy stack. */
  text_align: HeroTextAlign;
  /** Text, box and photo motion for this slide. */
  motion: HeroMotion;
  /** Per-part motion and alignment, each falling back to the slide-wide value. */
  parts: Record<HeroElementKey, HeroPartMotion>;
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

/** Background shapes for the heading and subheading. */
export const HERO_SHAPES = ['line', 'hug', 'full', 'outline'] as const;
export type HeroBgShape = (typeof HERO_SHAPES)[number];

/**
 * What shape the element's background is drawn in.
 *
 * Owner, 2026-08-17: "If there are 2 lines background is like a box. I need
 * separate small background for each line." Shape used to be implied by two
 * other settings — glass meant one box, the full-width flag meant a bar — so a
 * two-line heading could only ever be one rectangle. Lockstep with
 * HeroSlides::resolveElementShape(); when nothing is stored the old implication
 * is reproduced exactly, so no existing slide changes appearance.
 */
function resolveElementShape(
  row: Record<string, unknown> | null | undefined,
  key: HeroElementKey,
  token: string,
  fullWidth: boolean,
): HeroBgShape {
  if (key !== 'title' && key !== 'subtitle') return 'hug';

  const stored = String(row?.[`${key}_bg_shape`] ?? '').trim().toLowerCase();
  if ((HERO_SHAPES as readonly string[]).includes(stored)) return stored as HeroBgShape;

  if (fullWidth) return 'full';
  return token === 'glass' ? 'hug' : 'outline';
}

function resolveElementBackground(slide: SlideLike | null | undefined, key: HeroElementKey): HeroElementBackground {
  const row = slide as Record<string, unknown> | null | undefined;
  const bgKey = `${key}_bg`;
  const strengthKey = `${key}_bg_strength`;
  const fullKey = `${key}_bg_full_width`;
  const raw = row?.[bgKey];
  const hasBg = raw !== undefined && raw !== null && String(raw).trim() !== '';
  if (!hasBg) {
    return { token: null, strength: null, full_width: false, shape: 'outline', css: null };
  }

  const token = String(raw).trim().toLowerCase();
  const strengthRaw = row?.[strengthKey];
  const hasStrength = strengthRaw !== undefined && strengthRaw !== null && strengthRaw !== '';
  const strength = hasStrength ? clamp100(Number(strengthRaw)) : 70;
  const full_width = key === 'title' || key === 'subtitle'
    ? truthyFlag(row?.[fullKey])
    : false;
  const shape = resolveElementShape(row, key, token, full_width);

  if (token === 'none') {
    return { token: 'none', strength, full_width, shape, css: 'transparent' };
  }

  // Frosted glass — strength → white fill opacity (10 ≈ secondary CTA look).
  if (token === 'glass') {
    const alpha = Math.min(0.45, Math.max(0.02, strength / 100));
    return {
      token: 'glass',
      strength,
      full_width,
      shape,
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
    return { token: null, strength: null, full_width: false, shape: 'outline', css: null };
  }

  const alpha = strength / 100;
  return {
    token,
    strength,
    full_width,
    shape,
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

  // One background, not three. When the heading or subheading carries its own
  // panel, the copy scrim behind the whole stack is a second box around the
  // first — the "too large" look the owner reported (2026-08-16). Lockstep
  // with HeroSlides::presentation()['panelled'].
  // Only shapes that actually draw a box count — the outline shape paints
  // letter edges, not a panel, so there is nothing for the block shade to nest
  // inside and it must stay.
  const panelled = (['title', 'subtitle'] as const).some((key) => {
    const el = elements[key];
    const css = el?.css;
    return css != null && css !== '' && css !== 'transparent' && el?.shape !== 'outline';
  });

  // The owner asked to drive this themselves rather than have it happen
  // silently (2026-08-17). 'auto' is the behaviour they first approved: the
  // shade steps back only when it would nest inside a panel.
  const rawMode = String((row as Record<string, unknown> | null)?.copy_scrim_mode ?? 'auto').toLowerCase().trim();
  const copy_scrim_mode: HeroCopyScrimMode =
    rawMode === 'always' || rawMode === 'off' ? rawMode : 'auto';
  const copy_scrim =
    copy_scrim_mode === 'off' ? false : copy_scrim_mode === 'always' ? true : !panelled;

  return {
    photo_brightness: photoBrightness,
    text_background: textBackground,
    photo: photoBrightness / 100,
    scrim: textBackground / 100,
    text_position,
    elements,
    panelled,
    copy_scrim_mode,
    copy_scrim,
    styles: {
      title: resolveHeroElementStyle(row as Record<string, unknown>, 'title'),
      subtitle: resolveHeroElementStyle(row as Record<string, unknown>, 'subtitle'),
    },
    text_align: resolveHeroTextAlign(row as Record<string, unknown>),
    motion: resolveHeroMotion(row as Record<string, unknown>),
    parts: Object.fromEntries(
      HERO_ELEMENT_KEYS.map((k) => [k, resolveHeroPartMotion(row as Record<string, unknown>, k)]),
    ) as Record<HeroElementKey, HeroPartMotion>,
  };
}

export type HeroPresentationPatch = Partial<{
  photo_brightness: number;
  text_background: number;
  text_position: HeroTextPosition;
  copy_scrim_mode: HeroCopyScrimMode;
  eyebrow_bg: string | null;
  eyebrow_bg_strength: number | null;
  title_bg: string | null;
  title_bg_strength: number | null;
  title_bg_full_width: boolean | null;
  title_bg_shape: HeroBgShape | null;
  subtitle_bg: string | null;
  subtitle_bg_strength: number | null;
  subtitle_bg_full_width: boolean | null;
  subtitle_bg_shape: HeroBgShape | null;
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
    copy_scrim_mode: patch.copy_scrim_mode ?? base.copy_scrim_mode,
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
  applyNullable('title_bg', ['title_bg_strength', 'title_bg_full_width', 'title_bg_shape']);
  applyNullable('title_bg_strength');
  applyNullable('title_bg_full_width');
  applyNullable('title_bg_shape');
  applyNullable('subtitle_bg', ['subtitle_bg_strength', 'subtitle_bg_full_width', 'subtitle_bg_shape']);
  applyNullable('subtitle_bg_strength');
  applyNullable('subtitle_bg_full_width');
  applyNullable('subtitle_bg_shape');
  applyNullable('cta1_bg', ['cta1_bg_strength']);
  applyNullable('cta1_bg_strength');
  applyNullable('cta2_bg', ['cta2_bg_strength']);
  applyNullable('cta2_bg_strength');
  applyNullable('show_from');
  applyNullable('show_until');

  // The text-style fields (colours, outline, border, geometry, type) are an
  // open set rather than an enumerated one, so carry through anything the
  // caller sent that is not handled above. Without this the whole styling
  // panel silently did nothing — the patch was dropped on the floor.
  const HANDLED = new Set([
    'photo_brightness', 'text_background', 'text_position', 'copy_scrim_mode',
    'eyebrow_bg', 'eyebrow_bg_strength',
    'title_bg', 'title_bg_strength', 'title_bg_full_width', 'title_bg_shape',
    'subtitle_bg', 'subtitle_bg_strength', 'subtitle_bg_full_width', 'subtitle_bg_shape',
    'cta1_bg', 'cta1_bg_strength', 'cta2_bg', 'cta2_bg_strength',
    'show_from', 'show_until',
  ]);
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (HANDLED.has(k)) continue;
    if (v === null || v === '') {
      delete next[k];
    } else {
      next[k] = v;
    }
  }

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

/**
 * How hard the heading has to shrink to fit a fixed-height banner.
 *
 * Owner chose "words shrink to fit the banner" over "banner grows"
 * (2026-08-16), so a long heading steps down instead of wrapping to four lines
 * and pushing the panel out of the top of the banner. Bands are on plain-text
 * length, which is what drives the wrap — markup is stripped first so
 * <em>emphasis</em> does not count as content.
 *
 * Lockstep with HeroSlides::headingLengthBand().
 */
export function headingLengthBand(html: string): '' | 'long' | 'xlong' {
  const text = String(html ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .trim();

  if (text.length > 46) return 'xlong';
  if (text.length > 26) return 'long';
  return '';
}

/** Elements that carry the full text-style controls. */
export const HERO_STYLED_KEYS = ['title', 'subtitle'] as const;
export type HeroStyledKey = (typeof HERO_STYLED_KEYS)[number];

export type HeroTextAlign = 'left' | 'center' | 'right';

export type HeroElementStyle = {
  text_color: string | null;
  em_color: string | null;
  outline: boolean;
  outline_color: string | null;
  outline_width: string | null;
  border: boolean;
  border_color: string | null;
  border_width: string | null;
  bg_color2: string | null;
  bg_angle: number;
  radius: string | null;
  pad_x: string | null;
  pad_y: string | null;
  font_scale: string | null;
  font_weight: number | null;
};

/** Accept #rgb/#rrggbb or an rgba() we produced; reject anything else. */
function cssColor(raw: unknown): string | null {
  if (raw == null) return null;
  const v = String(raw).trim();
  if (v === '') return null;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return v.toLowerCase();
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i.test(v)) return v;
  return null;
}

function numberOrNull(raw: unknown): number | null {
  if (raw == null || raw === '' || Number.isNaN(Number(raw))) return null;
  return Number(raw);
}

function trimFloat(v: number): string {
  return String(Number(v.toFixed(4)));
}

function lengthStep(raw: unknown, def: number | null, min: number, max: number, unit: string): string | null {
  const n = numberOrNull(raw);
  if (n === null) return def === null ? null : `${trimFloat(def)}${unit}`;
  return `${trimFloat(min + (clamp100(n) / 100) * (max - min))}${unit}`;
}

/**
 * Per-element text style — lockstep with HeroSlides::resolveElementStyle().
 *
 * Owner, 2026-08-17: the letter outline used to be a SHAPE, so choosing a box
 * removed it and the two could never coexist; and every colour came from the
 * one background token, so the outline had no colour of its own and the text
 * could not be coloured at all. Outline and border are now independent
 * switches with their own colours. Unset values return null so the stylesheet
 * default wins and existing slides are untouched.
 */
export function resolveHeroElementStyle(
  slide: Record<string, unknown> | null | undefined,
  key: HeroElementKey,
): HeroElementStyle {
  const row = (slide ?? {}) as Record<string, unknown>;
  const bg = resolveElementBackground(row as SlideLike, key);

  const outlineRaw = row[`${key}_outline`];
  const outline = outlineRaw == null || outlineRaw === ''
    ? bg.shape === 'outline' && bg.css !== null && bg.css !== 'transparent'
    : truthyFlag(outlineRaw);

  let outlineColor = cssColor(row[`${key}_outline_color`]);
  if (outline && outlineColor === null) {
    outlineColor = bg.css !== 'transparent' ? bg.css : null;
  }

  const scaleRaw = numberOrNull(row[`${key}_font_scale`]);
  const weightRaw = numberOrNull(row[`${key}_font_weight`]);
  const angleRaw = numberOrNull(row[`${key}_bg_angle`]);

  return {
    text_color: cssColor(row[`${key}_text_color`]),
    em_color: cssColor(row[`${key}_em_color`]),
    outline,
    outline_color: outlineColor,
    outline_width: lengthStep(row[`${key}_outline_width`], 0.02, 0.005, 0.06, 'em'),
    border: truthyFlag(row[`${key}_border`]),
    border_color: cssColor(row[`${key}_border_color`]) ?? 'rgba(255,255,255,0.28)',
    border_width: lengthStep(row[`${key}_border_width`], 1.5, 0, 8, 'px'),
    bg_color2: cssColor(row[`${key}_bg_color2`]),
    bg_angle: angleRaw === null ? 135 : Math.max(0, Math.min(360, Math.round(angleRaw))),
    radius: lengthStep(row[`${key}_bg_radius`], null, 0, 40, 'px'),
    pad_x: lengthStep(row[`${key}_bg_pad_x`], null, 0, 2, 'em'),
    pad_y: lengthStep(row[`${key}_bg_pad_y`], null, 0, 1.5, 'em'),
    font_scale: scaleRaw === null ? null : trimFloat(Math.max(50, Math.min(200, scaleRaw)) / 100),
    font_weight: weightRaw === null ? null : Math.max(100, Math.min(900, Math.round(weightRaw / 100) * 100)),
  };
}

/**
 * The element's style as CSS custom properties. Everything unset is omitted so
 * the stylesheet's own value wins. Lockstep with HeroSlides::elementStyleVars().
 */
export function heroElementStyleVars(
  slide: Record<string, unknown> | null | undefined,
  key: HeroElementKey,
): Record<string, string> {
  const row = (slide ?? {}) as Record<string, unknown>;
  const bg = resolveElementBackground(row as SlideLike, key);
  const st = resolveHeroElementStyle(row, key);
  const vars: Record<string, string> = {};

  if (bg.css !== null && bg.css !== 'transparent') {
    vars['--hero-el-bg'] = st.bg_color2
      ? `linear-gradient(${st.bg_angle}deg, ${bg.css}, ${st.bg_color2})`
      : bg.css;
  }
  if (st.text_color) vars['--hero-el-text'] = st.text_color;
  if (st.em_color) vars['--hero-el-em'] = st.em_color;
  if (st.outline && st.outline_color) {
    vars['--hero-el-outline'] = st.outline_color;
    if (st.outline_width) vars['--hero-el-outline-w'] = st.outline_width;
  }
  if (st.border) {
    if (st.border_color) vars['--hero-el-border'] = st.border_color;
    if (st.border_width) vars['--hero-el-border-w'] = st.border_width;
  }
  if (st.radius) vars['--hero-el-radius'] = st.radius;
  if (st.pad_x) vars['--hero-el-pad-x'] = st.pad_x;
  if (st.pad_y) vars['--hero-el-pad-y'] = st.pad_y;
  if (st.font_scale) vars['--hero-el-scale'] = st.font_scale;
  if (st.font_weight) vars['--hero-el-weight'] = String(st.font_weight);

  return vars;
}

export function resolveHeroTextAlign(slide: Record<string, unknown> | null | undefined): HeroTextAlign {
  const raw = String((slide ?? {})['text_align'] ?? 'center').trim().toLowerCase();
  return raw === 'left' || raw === 'right' ? raw : 'center';
}

/** How the text arrives when a slide appears. Lockstep with HeroSlides. */
export const HERO_TEXT_ANIMS = ['none', 'fade', 'line', 'word', 'zoom'] as const;
export const HERO_BOX_ANIMS = ['none', 'glow', 'drift', 'sheen'] as const;
export const HERO_PHOTO_ANIMS = ['none', 'zoom', 'pan'] as const;

export type HeroTextAnim = (typeof HERO_TEXT_ANIMS)[number];
export type HeroBoxAnim = (typeof HERO_BOX_ANIMS)[number];
export type HeroPhotoAnim = (typeof HERO_PHOTO_ANIMS)[number];

export type HeroMotion = {
  text: HeroTextAnim;
  delay_step: number;
  box: HeroBoxAnim;
  photo: HeroPhotoAnim;
  speed: string;
};

/**
 * Motion settings — lockstep with HeroSlides::resolveMotion().
 *
 * Defaults keep today's behaviour: the hero already fades-and-rises, so 'fade'
 * is the default and nothing moves in the background unless asked. Reduced
 * motion is honoured in the stylesheet, not here.
 */
export function resolveHeroMotion(slide: Record<string, unknown> | null | undefined): HeroMotion {
  const row = (slide ?? {}) as Record<string, unknown>;
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const raw = String(row[key] ?? '').trim().toLowerCase();
    return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  };

  const stagger = Number(row.text_anim_stagger);
  const speedRaw = Number(row.motion_speed);

  return {
    text: pick('text_anim', HERO_TEXT_ANIMS, 'fade'),
    delay_step: Number.isFinite(stagger) && row.text_anim_stagger != null && row.text_anim_stagger !== ''
      ? Math.max(0, Math.min(400, Math.round(stagger)))
      : 90,
    box: pick('box_anim', HERO_BOX_ANIMS, 'none'),
    photo: pick('photo_anim', HERO_PHOTO_ANIMS, 'none'),
    speed:
      Number.isFinite(speedRaw) && row.motion_speed != null && row.motion_speed !== ''
        ? String(Number((0.5 + (clamp100(speedRaw) / 100) * 1.5).toFixed(4)))
        : '1',
  };
}

/**
 * Split one line's HTML into word spans for the word-by-word animation.
 * Tags pass through untouched so <em> keeps working and its colour still
 * applies; splitting the whole string on spaces would shred the markup.
 * Lockstep with HeroSlides::splitWordSpans().
 */
export function splitHeroWordSpans(html: string): string {
  const parts = String(html ?? '').split(/(<[^>]+>)/);
  let out = '';
  let i = 0;

  for (const part of parts) {
    if (part === '') continue;
    if (part.startsWith('<')) {
      out += part;
      continue;
    }
    for (const chunk of part.split(/(\s+)/)) {
      if (chunk === '') continue;
      if (chunk.trim() === '') {
        out += chunk;
        continue;
      }
      out += `<span class="hero-word" style="--hero-word-i: ${i};">${chunk}</span>`;
      i += 1;
    }
  }

  return out;
}

export type HeroPartMotion = {
  text: HeroTextAnim;
  box: HeroBoxAnim;
  align: HeroTextAlign;
};

/**
 * Motion and alignment for one part of the slide — lockstep with
 * HeroSlides::resolveElementMotion().
 *
 * Owner, 2026-08-17: "Setting that can be separated make it separate for each
 * part … I think alignment also be separated." Each falls back to the
 * slide-wide value, so a slide that only set the slide-wide one is unchanged
 * and that control still works as a way to set everything at once.
 */
export function resolveHeroPartMotion(
  slide: Record<string, unknown> | null | undefined,
  key: HeroElementKey,
): HeroPartMotion {
  const row = (slide ?? {}) as Record<string, unknown>;
  const slideMotion = resolveHeroMotion(row);
  const slideAlign = resolveHeroTextAlign(row);

  const pick = <T extends string>(field: string, allowed: readonly T[], fallback: T): T => {
    const raw = String(row[field] ?? '').trim().toLowerCase();
    return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  };

  return {
    text: pick(`${key}_anim`, HERO_TEXT_ANIMS, slideMotion.text),
    // Only the heading and subheading draw boxes worth animating.
    box: (HERO_STYLED_KEYS as readonly string[]).includes(key)
      ? pick(`${key}_box_anim`, HERO_BOX_ANIMS, slideMotion.box)
      : 'none',
    align: pick(`${key}_align`, ['left', 'center', 'right'] as const, slideAlign),
  };
}
