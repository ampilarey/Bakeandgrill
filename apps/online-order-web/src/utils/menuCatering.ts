/** Category names that should surface under the Event & catering menu section. */
export function categoryLooksLikeCatering(name: string | null | undefined): boolean {
  if (!name?.trim()) return false;
  return /\b(catering|events?)\b/i.test(name.trim());
}

type CatRef = { id: number; name: string; parent_id?: number | null };

/**
 * True when an item belongs in the menu page Catering section:
 * - catering channel flag, or
 * - filed under a Catering / Events category (or subcategory of one).
 */
export function isMenuCateringItem(
  item: { is_catering?: boolean; category_id?: number | null },
  categories: CatRef[],
): boolean {
  if (item.is_catering === true) return true;
  if (item.category_id == null) return false;
  const cat = categories.find((c) => c.id === item.category_id);
  if (!cat) return false;
  if (categoryLooksLikeCatering(cat.name)) return true;
  if (cat.parent_id != null) {
    const parent = categories.find((c) => c.id === cat.parent_id);
    if (parent && categoryLooksLikeCatering(parent.name)) return true;
  }
  return false;
}

/** Merge immediate-channel catering matches with the dedicated catering listing. */
export function mergeCateringSectionItems<T extends { id: number }>(
  channelItems: T[],
  cateringListing: T[],
  isCatering: (item: T) => boolean,
): T[] {
  const map = new Map<number, T>();
  for (const item of channelItems) {
    if (isCatering(item)) map.set(item.id, item);
  }
  for (const item of cateringListing) {
    map.set(item.id, item);
  }
  return [...map.values()];
}
