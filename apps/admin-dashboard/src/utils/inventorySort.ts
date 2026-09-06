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
  | 'days_left'
  | 'usage'
  | 'on_hand'
  | 'low_first'
  | 'category';

export const INVENTORY_SORTS: { key: InventorySortKey; label: string }[] = [
  { key: 'name', label: 'Name A–Z' },
  { key: 'low_first', label: 'Low stock first' },
  { key: 'days_left', label: 'Runs out soonest' },
  { key: 'usage', label: 'Most used per day' },
  { key: 'on_hand', label: 'Least on hand' },
  { key: 'category', label: 'Category' },
];

export const INVENTORY_SORT_STORAGE_KEY = 'bg_inventory_sort';

export function isInventorySortKey(v: unknown): v is InventorySortKey {
  return INVENTORY_SORTS.some((s) => s.key === v);
}

type Sortable = {
  name: string;
  quantity_on_hand: number;
  reorder_level: number | null;
  category?: { name: string } | null;
  usage_per_day?: number | null;
  bought_per_day?: number | null;
  days_left?: number | null;
};

const byName = (a: Sortable, b: Sortable) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/** The per-day rate a row stands on — tracked usage first, buying rate second. */
function rate(i: Sortable): number | null {
  const used = Number(i.usage_per_day ?? 0);
  if (used > 0) return used;
  const bought = Number(i.bought_per_day ?? 0);
  return bought > 0 ? bought : null;
}

const isLow = (i: Sortable) => i.reorder_level != null && i.quantity_on_hand <= i.reorder_level;

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
    case 'low_first':
      return out.sort((a, b) => Number(isLow(b)) - Number(isLow(a)) || byName(a, b));
    case 'days_left':
      return out.sort((a, b) => nullsLast(a.days_left, b.days_left, 1) || byName(a, b));
    case 'usage':
      return out.sort((a, b) => nullsLast(rate(a), rate(b), -1) || byName(a, b));
    case 'on_hand':
      return out.sort((a, b) => a.quantity_on_hand - b.quantity_on_hand || byName(a, b));
    case 'category':
      return out.sort((a, b) =>
        (a.category?.name ?? '￿').localeCompare(b.category?.name ?? '￿', undefined, { sensitivity: 'base' })
        || byName(a, b));
  }
}
