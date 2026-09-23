import type {
  MenuItemLite,
  SignageCategoryLite,
  SignageElement,
  SignageSlide,
} from './types';

/** `template_origin` marking a playlist entry that expands into generated slides. */
export const AUTO_MENU_ORIGIN = 'auto_menu';

const DEFAULT_SHOWCASE_CAP = 6;
const DEFAULT_ROWS_PER_SLIDE = 14;
const DEFAULT_SHOWCASE_SECONDS = 10;
const DEFAULT_CATEGORY_SECONDS = 14;

/**
 * Why an item gets a full-screen showcase slide of its own.
 *
 * Layout pass, 2026-09-23: a photo alone used to be a reason, and once
 * every dish had a photo the board was nothing but showcase slides — no
 * category list anywhere, and a loop of a dozen close-ups before the
 * prices came round. Now every item is listed on its category slide with
 * its photo as a thumbnail, and a showcase is earned by a special, a
 * Chef's pick or the promoted flag. Photographed items still take turns
 * in whatever room the cap leaves, so the close-ups keep coming.
 */
export function showcaseReason(item: MenuItemLite): 'special' | 'featured' | 'promoted' | null {
  if (item.special) return 'special';
  if (item.is_signage_promoted === true) return 'promoted';
  if (item.is_featured === true) return 'featured';
  return null;
}

/** An item can appear on a showcase slide: it has a reason, or at least a photo. */
export function qualifiesForShowcase(item: MenuItemLite): boolean {
  return showcaseReason(item) !== null || Boolean(item.image_url);
}

/** `show_on_signage` is opt-out: undefined/null means the item is on the board. */
export function isOnSignage(item: MenuItemLite): boolean {
  return item.show_on_signage !== false;
}

/** Sold-out dishes must not get a full-screen showcase (or category row ad). */
export function isSoldOutOnSignage(item: MenuItemLite): boolean {
  if (item.unavailable_reason === 'out_of_stock') return true;
  if (item.availability?.reason_code === 'out_of_stock') return true;
  if (item.availability?.available_stock === 0) return true;
  if (item.available_now === false && item.unavailable_reason === 'out_of_stock') return true;
  return false;
}

function showcaseRank(item: MenuItemLite): number {
  switch (showcaseReason(item)) {
    case 'special': return 0;
    case 'promoted': return 1;
    case 'featured': return 2;
    default: return 3;
  }
}

/** Specials, then promoted, then Chef's picks, then best-selling, then name. Total order — stable. */
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

function showcaseSlide(
  item: MenuItemLite,
  categoryName: string | null,
  source: SignageSlide,
  seconds: number,
  cardStyle: 'split' | 'stack',
): SignageSlide {
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
      el(`auto-sc-${item.id}-card`, 'item_card', 5, 7, 90, 82, {
        binding: { type: 'item', item_id: item.id },
        style: {
          layout: cardStyle,
          fontSize: 4.5,
          color: '#FFF8F0',
          showDescription: true,
          showBadge: true,
          eyebrow: categoryName ?? '',
        },
        animation: { entrance: 'fade', duration: 700 },
      }),
      el(`auto-sc-${item.id}-logo`, 'logo', 86, 3, 10, 9),
      el(`auto-sc-${item.id}-clock`, 'clock', 78, 91, 18, 6, {
        style: { fontSize: 2.2, color: '#C4B5A5', textAlign: 'right' },
      }),
    ],
  };
}

type CategoryLook = {
  preset: string;
  columns: number;
  showThumbs: boolean;
};

function categorySlide(
  key: string,
  title: string,
  titleDv: string | null,
  parentName: string | null,
  rows: MenuItemLite[],
  source: SignageSlide,
  seconds: number,
  look: CategoryLook,
): SignageSlide {
  const { showThumbs, columns } = look;
  const elements: SignageElement[] = [];
  if (parentName) {
    elements.push(el(`auto-cat-${key}-parent`, 'text', 4, 3, 70, 4, {
      text: parentName,
      style: { fontSize: 2.1, fontWeight: 700, color: '#D4813A', letterSpacing: 0.14, textTransform: 'uppercase' },
    }));
  }
  elements.push(
    el(`auto-cat-${key}-title`, 'text', 4, parentName ? 7 : 4, 78, 9, {
      text: title,
      text_dv: titleDv,
      style: { fontSize: 5, fontWeight: 800, color: '#FFF8F0', fontFamily: 'display' },
    }),
    el(`auto-cat-${key}-rule`, 'shape', 4, 17, 7, 0.7, {
      style: { fill: 'var(--signage-primary, #D4813A)', borderRadius: 4 },
    }),
  );
  const ids = { type: 'ids', item_ids: rows.map((r) => r.id), limit: rows.length };
  if (look.preset === 'photo_grid') {
    // Tiles: a photo with the name and price under it.
    elements.push(el(`auto-cat-${key}-tiles`, 'menu_tiles', 4, 20, 92, 76, {
      binding: ids,
      style: { fontSize: 2.6, color: '#FFF8F0', columns },
    }));
  } else if (look.preset === 'magazine') {
    // One large photo — the first row that has one — beside a single column.
    const hero = rows.find((r) => r.image_url);
    if (hero) {
      elements.push(el(`auto-cat-${key}-hero`, 'image', 4, 20, 40, 76, {
        binding: { url: hero.image_url },
        style: { objectFit: 'cover', borderRadius: 24 },
        animation: { emphasis: 'ken-burns', duration: 14000 },
      }));
    }
    elements.push(el(`auto-cat-${key}-list`, 'menu_list', hero ? 48 : 4, 20, hero ? 48 : 92, 76, {
      binding: ids,
      style: { fontSize: 2.8, color: '#FFF8F0', columns, showThumbs },
    }));
  } else {
    elements.push(el(`auto-cat-${key}-list`, 'menu_list', 4, 20, 92, 76, {
      binding: ids,
      style: { fontSize: 2.8, color: '#FFF8F0', columns, showThumbs },
    }));
  }
  elements.push(el(`auto-cat-${key}-logo`, 'logo', 86, 3, 10, 9));

  return {
    id: `auto-cat-${key}`,
    name: title,
    seconds,
    weight: 1,
    transition: source.transition ?? 'fade',
    transition_ms: source.transition_ms ?? 700,
    background: source.background ?? { type: 'solid', value: '#1C1408', opacity: 1 },
    template_origin: `${AUTO_MENU_ORIGIN}:category`,
    elements,
  };
}

/** Item is in one of `ids`, directly or through its category's parent. */
function inCategories(item: MenuItemLite, ids: number[], categories: SignageCategoryLite[]): boolean {
  if (item.category_id == null) return false;
  if (ids.includes(item.category_id)) return true;
  const parent = categories.find((c) => c.id === item.category_id)?.parent_id;
  return parent != null && ids.includes(parent);
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
  const cap = Math.max(0, Number(binding.showcase_cap ?? DEFAULT_SHOWCASE_CAP) || 0);
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
  // Thumbnails are on unless switched off — a row with its photo is the board.
  const showThumbs = binding.show_thumbs !== false;
  const preset = typeof binding.preset === 'string' ? binding.preset : 'classic';
  const columns = Math.min(4, Math.max(1, Number(binding.columns ?? 2) || 2));
  const cardStyle: 'split' | 'stack' = binding.card_style === 'stack' ? 'stack' : 'split';
  const onlyCategories = Array.isArray(binding.category_ids)
    ? (binding.category_ids as unknown[]).map(Number).filter((n) => Number.isFinite(n) && n > 0)
    : [];
  const look: CategoryLook = { preset, columns, showThumbs };

  const visible = items
    .filter(isOnSignage)
    // Sold out and past its grace: gone. Within the grace: listed with a pill.
    .filter((i) => !isSoldOutOnSignage(i) || i.sold_out_badge === true)
    // A screen may show part of the menu — the drinks counter, say. A
    // parent category takes its children along.
    .filter((i) => onlyCategories.length === 0 || inCategories(i, onlyCategories, categories));
  const byCategory = new Map(categories.map((c) => [c.id, c]));

  // Showcase: everything with a reason, then photographed items taking turns
  // in the room left under the cap. Length is fixed for a given menu.
  const inStock = visible.filter((i) => i.sold_out_badge !== true);
  const reasons = inStock.filter((i) => showcaseReason(i) !== null).sort(compareShowcase);
  const photos = inStock.filter((i) => showcaseReason(i) === null && Boolean(i.image_url)).sort(compareShowcase);
  const featured = reasons.length >= cap
    ? rotateWindow(reasons, cap, loopIndex)
    : [...reasons, ...rotateWindow(photos, cap - reasons.length, loopIndex)];
  const showcaseSlides = featured.map((item) => showcaseSlide(
    item,
    item.category_id != null ? (byCategory.get(item.category_id)?.name ?? null) : null,
    slide,
    showcaseSeconds,
    cardStyle,
  ));

  // Every visible item is listed under its category, in the admin's order.
  const known = categories.filter((c) => visible.some((i) => i.category_id === c.id));
  const orphans = visible.filter((i) => !categories.some((c) => c.id === i.category_id));
  const groups: Array<{ key: string; title: string; titleDv: string | null; parent: string | null; rows: MenuItemLite[] }> = known.map((c) => ({
    key: String(c.id),
    title: c.name,
    titleDv: c.name_dv?.trim() || null,
    parent: c.parent_id != null ? (byCategory.get(c.parent_id)?.name ?? null) : null,
    rows: visible.filter((i) => i.category_id === c.id),
  }));
  if (orphans.length > 0) {
    groups.push({ key: 'other', title: 'More on the menu', titleDv: null, parent: null, rows: orphans });
  }

  const categorySlides: SignageSlide[] = [];
  for (const group of groups) {
    const pages = Math.ceil(group.rows.length / rowsPerSlide);
    for (let p = 0; p < pages; p += 1) {
      const rows = group.rows.slice(p * rowsPerSlide, (p + 1) * rowsPerSlide);
      const title = pages > 1 ? `${group.title} (${p + 1}/${pages})` : group.title;
      categorySlides.push(
        categorySlide(`${group.key}-${p}`, title, group.titleDv, group.parent, rows, slide, categorySeconds, look),
      );
    }
  }

  // The lists carry the loop; showcases are spread through them.
  const expanded = categorySlides.length >= showcaseSlides.length
    ? interleave(categorySlides, showcaseSlides)
    : interleave(showcaseSlides, categorySlides);

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
