/**
 * Ordering the stock list. Owner, 2026-09-07: "Add inventory sort option in
 * both desktop and mobile view."
 *
 * One control, one rule set, both layouts — the table and the phone cards
 * draw the same ordered list, so what comes first never depends on the
 * screen. Pure so it can be tested without rendering anything.
 */
export type InventorySortKey =
  | 'name'
  | 'name_desc'
  | 'sku'
  | 'sku_desc'
  | 'days_left'
  | 'usage'
  | 'usage_asc'
  | 'on_hand'
  | 'on_hand_desc'
  | 'reorder_level'
  | 'reorder_level_desc'
  | 'low_first'
  | 'ok_first'
  | 'category'
  | 'category_desc';

export const INVENTORY_SORTS: { key: InventorySortKey; label: string }[] = [
  { key: 'name', label: 'Name A–Z' },
  { key: 'name_desc', label: 'Name Z–A' },
  { key: 'low_first', label: 'Low stock first' },
  { key: 'ok_first', label: 'OK first' },
  { key: 'days_left', label: 'Runs out soonest' },
  { key: 'usage', label: 'Most used per day' },
  { key: 'usage_asc', label: 'Least used per day' },
  { key: 'on_hand', label: 'Least on hand' },
  { key: 'on_hand_desc', label: 'Most on hand' },
  { key: 'reorder_level', label: 'Lowest reorder level' },
  { key: 'reorder_level_desc', label: 'Highest reorder level' },
  { key: 'sku', label: 'SKU A–Z' },
  { key: 'sku_desc', label: 'SKU Z–A' },
  { key: 'category', label: 'Category A–Z' },
  { key: 'category_desc', label: 'Category Z–A' },
];

/*
 * Owner, 2026-09-13: "in inventory add sort and filter option to heading."
 * Every column heading is also a sort control: tap once for one way, again
 * for the other. The dropdown and the headings drive the same key, so the
 * arrow on the heading always agrees with the dropdown.
 */
export type InventoryColumn = 'name' | 'sku' | 'category' | 'on_hand' | 'per_day' | 'reorder_level' | 'status';

export const INVENTORY_COLUMN_SORTS: Record<InventoryColumn, { asc: InventorySortKey; desc: InventorySortKey }> = {
  name: { asc: 'name', desc: 'name_desc' },
  sku: { asc: 'sku', desc: 'sku_desc' },
  category: { asc: 'category', desc: 'category_desc' },
  on_hand: { asc: 'on_hand', desc: 'on_hand_desc' },
  // "Ascending" on a rate reads best as most-used first — the number people
  // look at this column for.
  per_day: { asc: 'usage', desc: 'usage_asc' },
  reorder_level: { asc: 'reorder_level', desc: 'reorder_level_desc' },
  status: { asc: 'low_first', desc: 'ok_first' },
};

/** Which way a column is currently sorted, if it is the sorted column at all. */
export function columnSortState(key: InventorySortKey, column: InventoryColumn): 'asc' | 'desc' | null {
  const pair = INVENTORY_COLUMN_SORTS[column];
  return key === pair.asc ? 'asc' : key === pair.desc ? 'desc' : null;
}

/** What a tap on a heading should sort by: its first way, or the other way if it already is. */
export function nextColumnSort(key: InventorySortKey, column: InventoryColumn): InventorySortKey {
  const pair = INVENTORY_COLUMN_SORTS[column];
  return key === pair.asc ? pair.desc : pair.asc;
}

export const INVENTORY_SORT_STORAGE_KEY = 'bg_inventory_sort';

export function isInventorySortKey(v: unknown): v is InventorySortKey {
  return INVENTORY_SORTS.some((s) => s.key === v);
}

type Sortable = {
  name: string;
  sku?: string | null;
  quantity_on_hand: number;
  reorder_level: number | null;
  category?: { name: string } | null;
  usage_per_day?: number | null;
  bought_per_day?: number | null;
  days_left?: number | null;
};

const byName = (a: Sortable, b: Sortable) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/** The per-day rate a row stands on — tracked usage first, buying rate second. */
export function inventoryRate(i: Pick<Sortable, 'usage_per_day' | 'bought_per_day'>): number | null {
  const used = Number(i.usage_per_day ?? 0);
  if (used > 0) return used;
  const bought = Number(i.bought_per_day ?? 0);
  return bought > 0 ? bought : null;
}
const rate = inventoryRate;

/** Text columns that may be empty: the blanks sink to the bottom either way. */
function textNullsLast(a: string | null | undefined, b: string | null | undefined, dir: 1 | -1): number {
  const an = !a;
  const bn = !b;
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  return a!.localeCompare(b!, undefined, { sensitivity: 'base' }) * dir;
}

const isLow = (i: Sortable) => i.reorder_level != null && i.quantity_on_hand <= i.reorder_level;

/** "Reorder soon" means within a week at the current rate. */
export const REORDER_SOON_DAYS = 7;

/**
 * The buying list: at or under its reorder level, or going to run out
 * within a week at the rate it goes. Either signal is enough — an item
 * with no reorder level set still shows up when the rate says so, and one
 * with no rate still shows up when the level says so.
 */
export function needsReorderSoon(i: Sortable): boolean {
  return isLow(i) || (i.days_left != null && i.days_left <= REORDER_SOON_DAYS);
}

/**
 * A comparator where a missing value always sinks to the bottom, whichever
 * direction the known values run — "runs out soonest" must not open with
 * twenty items nobody has a rate for.
 */
function nullsLast(a: number | null | undefined, b: number | null | undefined, dir: 1 | -1): number {
  const an = a == null;
  const bn = b == null;
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  return (a! - b!) * dir;
}

export function sortInventory<T extends Sortable>(items: T[], key: InventorySortKey): T[] {
  const out = [...items];
  switch (key) {
    case 'name':
      return out.sort(byName);
    case 'name_desc':
      return out.sort((a, b) => byName(b, a));
    case 'sku':
      return out.sort((a, b) => textNullsLast(a.sku, b.sku, 1) || byName(a, b));
    case 'sku_desc':
      return out.sort((a, b) => textNullsLast(a.sku, b.sku, -1) || byName(a, b));
    case 'low_first':
      return out.sort((a, b) => Number(isLow(b)) - Number(isLow(a)) || byName(a, b));
    case 'ok_first':
      return out.sort((a, b) => Number(isLow(a)) - Number(isLow(b)) || byName(a, b));
    case 'days_left':
      return out.sort((a, b) => nullsLast(a.days_left, b.days_left, 1) || byName(a, b));
    case 'usage':
      return out.sort((a, b) => nullsLast(rate(a), rate(b), -1) || byName(a, b));
    case 'usage_asc':
      return out.sort((a, b) => nullsLast(rate(a), rate(b), 1) || byName(a, b));
    case 'on_hand':
      return out.sort((a, b) => a.quantity_on_hand - b.quantity_on_hand || byName(a, b));
    case 'on_hand_desc':
      return out.sort((a, b) => b.quantity_on_hand - a.quantity_on_hand || byName(a, b));
    case 'reorder_level':
      return out.sort((a, b) => nullsLast(a.reorder_level, b.reorder_level, 1) || byName(a, b));
    case 'reorder_level_desc':
      return out.sort((a, b) => nullsLast(a.reorder_level, b.reorder_level, -1) || byName(a, b));
    case 'category':
      return out.sort((a, b) => textNullsLast(a.category?.name, b.category?.name, 1) || byName(a, b));
    case 'category_desc':
      return out.sort((a, b) => textNullsLast(a.category?.name, b.category?.name, -1) || byName(a, b));
  }
}

export const INVENTORY_GROUP_STORAGE_KEY = 'bg_inventory_group_by_category';

/** A run of items sharing one category, in the order the list is already in. */
export type InventoryGroup<T> = { key: string; name: string; items: T[] };

/**
 * The stock list under its category headings. Owner, 2026-09-07: "add
 * grouping based on groups".
 *
 * Sorting by category already put like with like, but nothing said where one
 * group ended and the next began, and on a list this long that is the whole
 * point. Items keep whatever order the sort gave them inside their group, so
 * grouping composes with "Low stock first" rather than fighting it.
 *
 * Items with no category collect at the end: they are the ones somebody still
 * has to file, and burying them between real groups hides that.
 */
export function groupInventoryByCategory<T extends { category?: { name: string } | null }>(
  items: T[],
): InventoryGroup<T>[] {
  const groups = new Map<string, InventoryGroup<T>>();

  for (const item of items) {
    const name = item.category?.name?.trim() || '';
    const key = name.toLowerCase() || '\u0000uncategorised';
    let group = groups.get(key);
    if (!group) {
      group = { key, name: name || 'No category', items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }

  return [...groups.values()].sort((a, b) => {
    const aLast = a.key === '\u0000uncategorised';
    const bLast = b.key === '\u0000uncategorised';
    if (aLast !== bLast) return aLast ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}
