import type { MenuItem } from '../../api';
import { GRID_COLUMNS, marginPct } from './gridColumns';

/**
 * Search, filter and sort for the quick-edit grid.
 *
 * All of it runs on the set already loaded in the browser — the grid pulls
 * every item matching the page filters up front, so narrowing further is
 * instant and does not cost a round trip. Kept pure so the awkward parts
 * (a search that has to see Dhivehi names and size names, a sort that must
 * not orphan a size from its dish) are testable without a rendered table.
 */

export type GridFilters = {
  /** Matches name, Dhivehi name, card name, SKU, barcode and size names. */
  search: string;
  categoryId: number | null;
  menuGroupId: number | null;
  taxCode: string;
  availability: 'any' | 'available' | 'sold_out';
  status: 'any' | 'active' | 'hidden';
  sizes: 'any' | 'with' | 'without';
  stock: 'any' | 'tracked' | 'untracked' | 'low' | 'out';
  minPrice: string;
  maxPrice: string;
};

export const EMPTY_FILTERS: GridFilters = {
  search: '',
  categoryId: null,
  menuGroupId: null,
  taxCode: '',
  availability: 'any',
  status: 'any',
  sizes: 'any',
  stock: 'any',
  minPrice: '',
  maxPrice: '',
};

export type SortState = { key: string; direction: 'asc' | 'desc' } | null;

export function activeFilterCount(filters: GridFilters): number {
  let n = 0;
  if (filters.search.trim() !== '') n += 1;
  if (filters.categoryId !== null) n += 1;
  if (filters.menuGroupId !== null) n += 1;
  if (filters.taxCode !== '') n += 1;
  if (filters.availability !== 'any') n += 1;
  if (filters.status !== 'any') n += 1;
  if (filters.sizes !== 'any') n += 1;
  if (filters.stock !== 'any') n += 1;
  if (filters.minPrice.trim() !== '') n += 1;
  if (filters.maxPrice.trim() !== '') n += 1;

  return n;
}

function haystack(item: MenuItem): string {
  const parts = [
    item.name,
    item.name_dv,
    item.card_name,
    item.sku,
    (item as unknown as Record<string, unknown>).barcode,
    item.category?.name,
    // A search for "half" should find the dish that has a Half, not nothing.
    ...(item.variants ?? []).flatMap((v) => [v.name, v.name_dv, v.sku]),
  ];

  return parts.filter(Boolean).join(' ').toLowerCase();
}

function matchesStock(item: MenuItem, mode: GridFilters['stock']): boolean {
  const tracked = !!item.track_stock;
  switch (mode) {
    case 'tracked': return tracked;
    case 'untracked': return !tracked;
    case 'out': return tracked && Number(item.stock_quantity ?? 0) <= 0;
    case 'low': {
      if (!tracked) return false;
      const qty = Number(item.stock_quantity ?? 0);
      const threshold = Number(item.low_stock_threshold ?? 5);

      return qty > 0 && qty <= threshold;
    }
    default: return true;
  }
}

export function applyFilters(items: MenuItem[], filters: GridFilters): MenuItem[] {
  const needle = filters.search.trim().toLowerCase();
  const min = filters.minPrice.trim() === '' ? null : Number(filters.minPrice);
  const max = filters.maxPrice.trim() === '' ? null : Number(filters.maxPrice);

  return items.filter((item) => {
    if (needle !== '' && !haystack(item).includes(needle)) return false;
    if (filters.categoryId !== null && (item.category_id ?? null) !== filters.categoryId) return false;
    if (filters.menuGroupId !== null && (item.menu_group_id ?? null) !== filters.menuGroupId) return false;
    if (filters.taxCode !== '' && (item.tax_code ?? 'standard_8') !== filters.taxCode) return false;
    if (filters.availability === 'available' && !item.is_available) return false;
    if (filters.availability === 'sold_out' && item.is_available) return false;
    if (filters.status === 'active' && !item.is_active) return false;
    if (filters.status === 'hidden' && item.is_active) return false;

    const sizeCount = (item.variants ?? []).length;
    if (filters.sizes === 'with' && sizeCount === 0) return false;
    if (filters.sizes === 'without' && sizeCount > 0) return false;

    if (!matchesStock(item, filters.stock)) return false;

    const price = Number(item.base_price);
    if (min !== null && Number.isFinite(min) && !(price >= min)) return false;
    if (max !== null && Number.isFinite(max) && !(price <= max)) return false;

    return true;
  });
}

/**
 * Sort by a column, falling back to the menu's own order.
 *
 * Sizes are never sorted independently — they are rendered under their dish,
 * so reordering them across items would tear them away from it.
 */
export function applySort(items: MenuItem[], sort: SortState): MenuItem[] {
  const rows = items.slice();
  if (!sort) {
    return rows.sort((a, b) => {
      const bySort = Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);

      return bySort !== 0 ? bySort : String(a.name).localeCompare(String(b.name));
    });
  }

  const column = GRID_COLUMNS.find((c) => c.key === sort.key);
  const value = column?.sortValue
    ?? ((item: MenuItem) => String((item as unknown as Record<string, unknown>)[sort.key] ?? '').toLowerCase());
  const direction = sort.direction === 'asc' ? 1 : -1;

  return rows.sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (av === bv) return String(a.name).localeCompare(String(b.name));
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction;

    return String(av).localeCompare(String(bv)) * direction;
  });
}

/** Click cycle for a header: ascending, descending, then back to menu order. */
export function nextSort(current: SortState, key: string): SortState {
  if (!current || current.key !== key) return { key, direction: 'asc' };
  if (current.direction === 'asc') return { key, direction: 'desc' };

  return null;
}

/** Everything the grid should render, filtered and sorted. */
export function visibleRows(items: MenuItem[], filters: GridFilters, sort: SortState): MenuItem[] {
  return applySort(applyFilters(items, filters), sort);
}

/** Margin re-exported so the grid does not import two modules for one cell. */
export { marginPct };
