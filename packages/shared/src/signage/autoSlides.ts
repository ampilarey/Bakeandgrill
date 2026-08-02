import type {
  MenuItemLite,
  SignageCategoryLite,
  SignageElement,
  SignageSlide,
} from './types';

/** `template_origin` marking a playlist entry that expands into generated slides. */
export const AUTO_MENU_ORIGIN = 'auto_menu';

const DEFAULT_SHOWCASE_CAP = 12;
const DEFAULT_ROWS_PER_SLIDE = 14;
const DEFAULT_SHOWCASE_SECONDS = 10;
const DEFAULT_CATEGORY_SECONDS = 14;

/**
 * An item earns a full-screen showcase slide when it has something to show:
 * a photo, an active special, or an explicit promoted flag. Everything else is
 * listed as a row on a category slide.
 */
export function qualifiesForShowcase(item: MenuItemLite): boolean {
  return Boolean(item.image_url) || Boolean(item.special) || item.is_signage_promoted === true;
}

/** `show_on_signage` is opt-out: undefined/null means the item is on the board. */
export function isOnSignage(item: MenuItemLite): boolean {
  return item.show_on_signage !== false;
}

function showcaseRank(item: MenuItemLite): number {
  if (item.special) return 0;
  if (item.is_signage_promoted) return 1;
  return 2;
}

/** Specials first, then promoted, then best-selling, then name. Total order — stable. */
function compareShowcase(a: MenuItemLite, b: MenuItemLite): number {
  return (
    showcaseRank(a) - showcaseRank(b)
    || (b.sales_30d ?? 0) - (a.sales_30d ?? 0)
    || a.name.localeCompare(b.name)
    || a.id - b.id
  );
}

/**
 * Window `list` to `cap` entries, advancing by a full page each loop so
 * successive loops feature different items and every item eventually shows.
 * Deterministic in `loopIndex` — the TV and the designer preview must agree.
 */
export function rotateWindow<T>(list: T[], cap: number, loopIndex: number): T[] {
  if (cap <= 0 || list.length === 0) return [];
  if (list.length <= cap) return [...list];
  const safeLoop = Number.isFinite(loopIndex) ? Math.trunc(loopIndex) : 0;
  const start = (((safeLoop * cap) % list.length) + list.length) % list.length;

  return Array.from({ length: cap }, (_, k) => list[(start + k) % list.length]);
}

/** Spread the shorter list evenly through the longer one. */
function interleave(primary: SignageSlide[], secondary: SignageSlide[]): SignageSlide[] {
  if (secondary.length === 0) return primary;
  if (primary.length === 0) return secondary;

  const out: SignageSlide[] = [];
  const gap = primary.length / secondary.length;
  let si = 0;
  for (let i = 0; i < primary.length; i += 1) {
    out.push(primary[i]);
    while (si < secondary.length && (si + 1) * gap <= i + 1) {
      out.push(secondary[si]);
      si += 1;
    }
  }
  while (si < secondary.length) {
    out.push(secondary[si]);
    si += 1;
  }

  return out;
}

function el(
  id: string,
  type: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<SignageElement> = {},
): SignageElement {
  return {
    id, type, x, y, w, h, rotation: 0, z: 1, style: {}, animation: {}, binding: {}, ...extra,
  };
}

function showcaseSlide(item: MenuItemLite, source: SignageSlide, seconds: number): SignageSlide {
  return {
    id: `auto-sc-${item.id}`,
    name: item.name,
    seconds,
    // Constant weight: the expanded rotation length must not vary with which
    // items the loop happens to feature, or loop counting drifts.
    weight: 1,
    transition: source.transition ?? 'fade',
    transition_ms: source.transition_ms ?? 700,
    background: source.background ?? { type: 'solid', value: '#1C1408', opacity: 1 },
    template_origin: `${AUTO_MENU_ORIGIN}:showcase`,
    elements: [
      el(`auto-sc-${item.id}-card`, 'item_card', 8, 8, 84, 76, {
        binding: { type: 'item', item_id: item.id },
        style: { fontSize: 4.5, color: '#FFF8F0', showDescription: true, showBadge: true },
        animation: { entrance: 'fade', duration: 700 },
      }),
      el(`auto-sc-${item.id}-logo`, 'logo', 86, 3, 10, 9),
      el(`auto-sc-${item.id}-clock`, 'clock', 78, 88, 18, 7, {
        style: { fontSize: 2.4, color: '#C4B5A5', textAlign: 'right' },
      }),
    ],
  };
}

function categorySlide(
  key: string,
  title: string,
  rows: MenuItemLite[],
  source: SignageSlide,
  seconds: number,
  showThumbs: boolean,
): SignageSlide {
  return {
    id: `auto-cat-${key}`,
    name: title,
    seconds,
    weight: 1,
    transition: source.transition ?? 'fade',
    transition_ms: source.transition_ms ?? 700,
    background: source.background ?? { type: 'solid', value: '#1C1408', opacity: 1 },
    template_origin: `${AUTO_MENU_ORIGIN}:category`,
    elements: [
      el(`auto-cat-${key}-title`, 'text', 4, 4, 70, 8, {
        text: title,
        style: { fontSize: 4.5, fontWeight: 800, color: '#FFF8F0' },
      }),
      el(`auto-cat-${key}-list`, 'menu_list', 4, 14, 92, 78, {
        binding: { type: 'ids', item_ids: rows.map((r) => r.id), limit: rows.length },
        style: { fontSize: 2.8, color: '#FFF8F0', columns: 2, showThumbs },
      }),
      el(`auto-cat-${key}-logo`, 'logo', 86, 3, 10, 9),
    ],
  };
}

/**
 * Expand an `auto_menu` playlist entry into generated slides.
 *
 * Any other slide passes through untouched — hand-authored playlists are
 * unaffected by this stage.
 */
export function expandAutoSlides(
  slide: SignageSlide,
  items: MenuItemLite[],
  categories: SignageCategoryLite[],
  loopIndex = 0,
): SignageSlide[] {
  if (slide.template_origin !== AUTO_MENU_ORIGIN) return [slide];

  const binding = (slide.elements?.[0]?.binding ?? {}) as Record<string, unknown>;
  const cap = Math.max(1, Number(binding.showcase_cap ?? DEFAULT_SHOWCASE_CAP) || DEFAULT_SHOWCASE_CAP);
  const rowsPerSlide = Math.max(
    1,
    Number(binding.rows_per_slide ?? DEFAULT_ROWS_PER_SLIDE) || DEFAULT_ROWS_PER_SLIDE,
  );
  const showcaseSeconds = Math.max(
    1,
    Number(binding.showcase_seconds ?? slide.seconds ?? DEFAULT_SHOWCASE_SECONDS) || DEFAULT_SHOWCASE_SECONDS,
  );
  const categorySeconds = Math.max(
    1,
    Number(binding.category_seconds ?? DEFAULT_CATEGORY_SECONDS) || DEFAULT_CATEGORY_SECONDS,
  );
  const showThumbs = binding.show_thumbs === true;

  const visible = items.filter(isOnSignage);
  const showcaseAll = visible.filter(qualifiesForShowcase).sort(compareShowcase);
  const listed = visible.filter((i) => !qualifiesForShowcase(i));

  const featured = rotateWindow(showcaseAll, cap, loopIndex);
  const showcaseSlides = featured.map((item) => showcaseSlide(item, slide, showcaseSeconds));

  // Group listed items by category, following the admin's category order.
  const known = categories.filter((c) => listed.some((i) => i.category_id === c.id));
  const orphans = listed.filter((i) => !categories.some((c) => c.id === i.category_id));
  const groups: Array<{ key: string; title: string; rows: MenuItemLite[] }> = known.map((c) => ({
    key: String(c.id),
    title: c.name,
    rows: listed.filter((i) => i.category_id === c.id),
  }));
  if (orphans.length > 0) {
    groups.push({ key: 'other', title: 'More on the menu', rows: orphans });
  }

  const categorySlides: SignageSlide[] = [];
  for (const group of groups) {
    const pages = Math.ceil(group.rows.length / rowsPerSlide);
    for (let p = 0; p < pages; p += 1) {
      const rows = group.rows.slice(p * rowsPerSlide, (p + 1) * rowsPerSlide);
      const title = pages > 1 ? `${group.title} (${p + 1}/${pages})` : group.title;
      categorySlides.push(
        categorySlide(`${group.key}-${p}`, title, rows, slide, categorySeconds, showThumbs),
      );
    }
  }

  const expanded = showcaseSlides.length >= categorySlides.length
    ? interleave(showcaseSlides, categorySlides)
    : interleave(categorySlides, showcaseSlides);

  // An empty menu must not blank the board — keep the placeholder in rotation.
  return expanded.length > 0 ? expanded : [slide];
}

/** Expand every `auto_menu` entry in a playlist, leaving other slides in place. */
export function expandPlaylist(
  slides: SignageSlide[],
  items: MenuItemLite[],
  categories: SignageCategoryLite[],
  loopIndex = 0,
): SignageSlide[] {
  return slides.flatMap((s) => expandAutoSlides(s, items, categories, loopIndex));
}
