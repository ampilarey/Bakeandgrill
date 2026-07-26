import type { MenuItemLite, SignageConfig, SignageElement } from './types';

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
              base_price: b.base_price,
              image_url: b.image_url,
              short_description: b.short_description,
              sales_30d: b.sales_30d,
            }))
          : list.filter((i) => (i.sales_30d ?? 0) > 0).sort((a, b) => (b.sales_30d ?? 0) - (a.sales_30d ?? 0)));
        break;
      case 'combos':
        list = list.filter((i) => !!i.is_combo);
        break;
      case 'chef_recommendation':
      case 'featured_product':
        list = list.slice(0, limit);
        break;
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
