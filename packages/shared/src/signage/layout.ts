import type { SignageSlide } from './types';

/**
 * A TV's "look": which layout preset the generated menu uses and the knobs
 * on top of it. Set per group or per screen in Admin → TV Signage; the
 * screen's setting wins over the group's, and both sit on the preset's
 * defaults. Owner, 2026-09-23: "setting different layout for the tv in
 * admin app".
 */
export type SignageLayoutPreset = 'classic' | 'photo_grid' | 'magazine' | 'price_board' | 'portrait';

export type SignageLayout = {
  preset: SignageLayoutPreset;
  /** Columns on a category list. */
  columns: number;
  /** Rows (or tiles) per generated category slide. */
  rows_per_slide: number;
  /** Round photo beside each row. */
  show_thumbs: boolean;
  /** Showcase slides per loop; specials and picks come first. 0 switches them off. */
  showcase_cap: number;
  /** Showcase card: photo beside the words, or under a round photo. */
  card_style: 'split' | 'stack';
  /** Only these categories on the generated slides; empty = the whole menu. */
  category_ids: number[];
  /** Dhivehi as the main name, English small — for a screen facing the local crowd. */
  dhivehi_first: boolean;
};

/** What a stored or server-sent look may hold — checked field by field by resolveLayout. */
export type SignageLayoutInput = { [K in keyof SignageLayout]?: unknown } | null | undefined;

export const LAYOUT_PRESETS: Record<SignageLayoutPreset, { label: string; blurb: string; defaults: Omit<SignageLayout, 'preset' | 'category_ids' | 'dhivehi_first'> }> = {
  classic: {
    label: 'Classic list',
    blurb: 'Two columns with photos, dotted leaders to the price. The dining-room board.',
    defaults: { columns: 2, rows_per_slide: 14, show_thumbs: true, showcase_cap: 6, card_style: 'split' },
  },
  photo_grid: {
    label: 'Photo grid',
    blurb: 'Big photo tiles, six a slide, name and price on each. Sells with pictures.',
    defaults: { columns: 3, rows_per_slide: 6, show_thumbs: true, showcase_cap: 3, card_style: 'split' },
  },
  magazine: {
    label: 'Magazine',
    blurb: 'One large photo beside a single-column list. Calm and readable.',
    defaults: { columns: 1, rows_per_slide: 8, show_thumbs: false, showcase_cap: 4, card_style: 'split' },
  },
  price_board: {
    label: 'Price board',
    blurb: 'Dense three-column text, no photos, no showcases. The counter screen.',
    defaults: { columns: 3, rows_per_slide: 27, show_thumbs: false, showcase_cap: 0, card_style: 'stack' },
  },
  portrait: {
    label: 'Portrait pillar',
    blurb: 'One tall column with photos and stacked showcase cards. For a screen on its side.',
    defaults: { columns: 1, rows_per_slide: 16, show_thumbs: true, showcase_cap: 4, card_style: 'stack' },
  },
};

export const LAYOUT_PRESET_KEYS = Object.keys(LAYOUT_PRESETS) as SignageLayoutPreset[];

export function isLayoutPreset(v: unknown): v is SignageLayoutPreset {
  return typeof v === 'string' && v in LAYOUT_PRESETS;
}

function num(v: unknown, min: number, max: number): number | undefined {
  const n = Number(v);
  if (v == null || v === '' || !Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/**
 * The effective layout: preset defaults, then each partial in order (group,
 * then screen). A later `preset` resets the knobs to that preset's defaults
 * before its own overrides apply, so switching preset on a screen does not
 * drag the group's column count along.
 */
export function resolveLayout(...layers: SignageLayoutInput[]): SignageLayout {
  let preset: SignageLayoutPreset = 'classic';
  for (const layer of layers) {
    if (layer && isLayoutPreset(layer.preset)) preset = layer.preset;
  }
  const out: SignageLayout = {
    preset,
    ...LAYOUT_PRESETS[preset].defaults,
    category_ids: [],
    dhivehi_first: false,
  };
  // Knobs: only from layers that agree with the final preset (or name none).
  for (const layer of layers) {
    if (!layer) continue;
    if (isLayoutPreset(layer.preset) && layer.preset !== preset) continue;
    const columns = num(layer.columns, 1, 4);
    const rows = num(layer.rows_per_slide, 1, 40);
    const cap = num(layer.showcase_cap, 0, 30);
    if (columns != null) out.columns = columns;
    if (rows != null) out.rows_per_slide = rows;
    if (cap != null) out.showcase_cap = cap;
    if (typeof layer.show_thumbs === 'boolean') out.show_thumbs = layer.show_thumbs;
    if (layer.card_style === 'split' || layer.card_style === 'stack') out.card_style = layer.card_style;
    if (Array.isArray(layer.category_ids)) {
      out.category_ids = layer.category_ids.map(Number).filter((n) => Number.isFinite(n) && n > 0);
    }
    if (typeof layer.dhivehi_first === 'boolean') out.dhivehi_first = layer.dhivehi_first;
  }
  return out;
}

/**
 * Apply a look to a playlist's slides before expansion.
 *
 * The auto-menu entry's binding gets the layout's knobs (the designer's
 * own values on that entry are the fallback when no look is set, which is
 * why this only runs when a layout is given). Smart lists take the column
 * count and thumbnail switch so a price board is dense everywhere, not
 * only on its category slides. Hand-designed slides are left alone.
 */
export function applyLayoutToSlides(slides: SignageSlide[], layout: SignageLayout | null | undefined): SignageSlide[] {
  if (!layout) return slides;
  return slides.map((slide) => {
    if (slide.template_origin === 'auto_menu' && slide.elements?.[0]) {
      const [first, ...rest] = slide.elements;
      return {
        ...slide,
        elements: [{
          ...first,
          binding: {
            ...(first.binding ?? {}),
            preset: layout.preset,
            columns: layout.columns,
            rows_per_slide: layout.rows_per_slide,
            show_thumbs: layout.show_thumbs,
            showcase_cap: layout.showcase_cap,
            card_style: layout.card_style,
            category_ids: layout.category_ids,
          },
        }, ...rest],
      };
    }
    if (String(slide.template_origin ?? '').startsWith('smart:')) {
      return {
        ...slide,
        elements: (slide.elements ?? []).map((el) => (el.type === 'menu_list'
          ? { ...el, style: { ...(el.style ?? {}), columns: layout.columns, showThumbs: layout.show_thumbs } }
          : el)),
      };
    }
    return slide;
  });
}
