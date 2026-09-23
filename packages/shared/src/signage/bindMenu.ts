import type { MenuItemLite, SignageConfig, SignageElement, SignageSlide } from './types';

function isNew(item: MenuItemLite, days: number, now = Date.now()): boolean {
  if (!item.created_at || !(days > 0)) return false;
  const t = new Date(item.created_at).getTime();
  return Number.isFinite(t) && now - t <= days * 86400000;
}

export function resolveBoundItems(
  el: SignageElement,
  items: MenuItemLite[],
  config: SignageConfig,
): MenuItemLite[] {
  const binding = el.binding ?? {};
  const limit = Math.max(1, Number(binding.limit ?? 10) || 10);
  const type = String(binding.type ?? '');

  if (type === 'smart' || binding.smart_type) {
    const smart = String(binding.smart_type ?? '');
    let list = [...items];
    switch (smart) {
      case 'offers':
      case 'todays_special':
        list = list.filter((i) => !!i.special);
        break;
      case 'new':
        list = list.filter((i) => isNew(i, config.menu_new_days));
        break;
      case 'bestsellers':
        list = (config.bestsellers?.length
          ? config.bestsellers.map((b) => ({
              id: b.id,
              name: b.name,
              name_dv: b.name_dv ?? null,
              base_price: b.base_price,
              image_url: b.image_url,
              thumb_url: b.thumb_url ?? null,
              image_webp_url: b.image_webp_url ?? null,
              thumb_webp_url: b.thumb_webp_url ?? null,
              short_description: b.short_description,
              sales_30d: b.sales_30d,
            }))
          : list.filter((i) => (i.sales_30d ?? 0) > 0).sort((a, b) => (b.sales_30d ?? 0) - (a.sales_30d ?? 0)));
        break;
      case 'combos':
        list = list.filter((i) => !!i.is_combo);
        break;
      case 'chef_recommendation':
      case 'featured_product': {
        // The owner's Chef's picks, when any are ticked; the whole list otherwise.
        const picks = list.filter((i) => i.is_featured === true);
        list = (picks.length > 0 ? picks : list).slice(0, limit);
        break;
      }
      case 'category_highlight': {
        const catId = binding.category_id != null ? Number(binding.category_id) : null;
        list = catId != null ? list.filter((i) => i.category_id === catId) : list;
        break;
      }
      default:
        break;
    }
    return list.slice(0, limit);
  }

  if (type === 'ids') {
    const ids = Array.isArray(binding.item_ids) ? binding.item_ids.map(Number) : [];
    const byId = new Map(items.map((i) => [i.id, i]));

    return ids
      .map((id) => byId.get(id))
      .filter((i): i is MenuItemLite => !!i)
      .slice(0, Math.max(limit, ids.length));
  }

  if (type === 'category') {
    const catId = binding.category_id != null ? Number(binding.category_id) : null;
    const list = catId != null
      ? items.filter((i) => i.category_id === catId)
      : items;
    return list.slice(0, limit);
  }

  if (type === 'item' || el.type === 'item_card') {
    const id = Number(binding.item_id ?? 0);
    const hit = items.find((i) => i.id === id);
    return hit ? [hit] : [];
  }

  return items.slice(0, limit);
}

export function formatPrice(n: number): string {
  return `${Number(n).toFixed(2)}/-`;
}

/** Element types whose whole content comes from the menu binding. */
const MENU_BOUND_TYPES = new Set(['menu_list', 'item_card', 'price_row']);

/**
 * Whether a slide has anything to show once its menu bindings resolve.
 *
 * Signage audit, 2026-09-23: "Today's offers" is a list slide bound to
 * items on special. With no special running it still took its 14 seconds
 * in every loop, as a title over an empty dark screen. A slide with no
 * menu-bound element is always content; one with such elements is content
 * only if at least one of them resolves to an item.
 */
export function slideHasContent(
  slide: SignageSlide,
  items: MenuItemLite[],
  config: SignageConfig,
): boolean {
  const bound = (slide.elements ?? []).filter((e) => !e.hidden && MENU_BOUND_TYPES.has(e.type));
  if (bound.length === 0) return true;

  return bound.some((e) => resolveBoundItems(e, items, config).length > 0);
}

/** The slides worth showing — see {@link slideHasContent}. */
export function pruneEmptySlides(
  slides: SignageSlide[],
  items: MenuItemLite[],
  config: SignageConfig,
): SignageSlide[] {
  return slides.filter((s) => slideHasContent(s, items, config));
}
