/**
 * Narrowing the stock list by column. Owner, 2026-09-13: "in inventory add
 * sort and filter option to heading."
 *
 * One box under each heading. Text columns match anywhere in the value,
 * category and status are a pick, and the three number columns take a
 * small expression — `<20`, `>=5`, `10-50`, `none` — because "what is
 * under twenty" is the question somebody has when they look at On hand,
 * and a plain equals would never be it.
 *
 * Pure, and applied before the sort, so the table and the phone cards
 * agree on what is in the list.
 */
import { inventoryRate } from './inventorySort';

export type InventoryStatusFilter = '' | 'low' | 'ok';

export type InventoryFilters = {
  sku: string;
  /** A category name; `__none` for the items that have none. */
  category: string;
  status: InventoryStatusFilter;
  on_hand: string;
  per_day: string;
  reorder_level: string;
};

export const EMPTY_INVENTORY_FILTERS: InventoryFilters = {
  sku: '', category: '', status: '', on_hand: '', per_day: '', reorder_level: '',
};

/** The category name that stands for "no category". */
export const NO_CATEGORY = '__none';

type Filterable = {
  sku?: string | null;
  quantity_on_hand: number;
  reorder_level: number | null;
  category?: { name: string } | null;
  usage_per_day?: number | null;
  bought_per_day?: number | null;
};

/**
 * Turn `<20`, `>=5`, `=3`, `10-50`, `7` or `none` into a test. Null when
 * the box is empty or does not parse yet — a half-typed `<` must not blank
 * the list.
 */
export function parseNumberFilter(expr: string): ((v: number | null) => boolean) | null {
  const s = expr.trim().toLowerCase().replace(/\s+/g, '');
  if (s === '') return null;
  if (s === 'none' || s === '-' || s === '—') return (v) => v == null;

  const range = s.match(/^(-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)$/);
  if (range) {
    const lo = Math.min(Number(range[1]), Number(range[2]));
    const hi = Math.max(Number(range[1]), Number(range[2]));
    return (v) => v != null && v >= lo && v <= hi;
  }

  const cmp = s.match(/^(<=|>=|<|>|=)?(-?\d+(?:\.\d+)?)$/);
  if (!cmp) return null;
  const n = Number(cmp[2]);
  switch (cmp[1] ?? '=') {
    case '<': return (v) => v != null && v < n;
    case '<=': return (v) => v != null && v <= n;
    case '>': return (v) => v != null && v > n;
    case '>=': return (v) => v != null && v >= n;
    default: return (v) => v != null && Math.abs(v - n) < 0.000001;
  }
}

const isLow = (i: Filterable) => i.reorder_level != null && i.quantity_on_hand <= i.reorder_level;

export function filterInventory<T extends Filterable>(items: T[], f: InventoryFilters): T[] {
  const sku = f.sku.trim().toLowerCase();
  const category = f.category.trim().toLowerCase();
  const onHand = parseNumberFilter(f.on_hand);
  const perDay = parseNumberFilter(f.per_day);
  const reorder = parseNumberFilter(f.reorder_level);

  return items.filter((i) => {
    if (sku && !(i.sku ?? '').toLowerCase().includes(sku)) return false;
    if (category) {
      const own = (i.category?.name ?? '').trim().toLowerCase();
      if (category === NO_CATEGORY ? own !== '' : own !== category) return false;
    }
    if (f.status === 'low' && !isLow(i)) return false;
    if (f.status === 'ok' && isLow(i)) return false;
    if (onHand && !onHand(i.quantity_on_hand)) return false;
    if (perDay && !perDay(inventoryRate(i))) return false;
    if (reorder && !reorder(i.reorder_level)) return false;
    return true;
  });
}

/** How many boxes are doing something — for the "Clear filters (n)" button. */
export function activeFilterCount(f: InventoryFilters): number {
  return (Object.keys(EMPTY_INVENTORY_FILTERS) as (keyof InventoryFilters)[])
    .filter((k) => f[k].trim() !== '').length;
}
