import type { MenuCategory, MenuGroupRow, MenuItem } from '../../api';

/**
 * What the quick-edit grid can show, and which of those you actually want.
 *
 * Owner, 2026-09-01: "cant u add more options, and option to hide/show in the
 * table so unwanted column can be hided". So the column set is wide and the
 * visible subset is a per-person preference, kept in localStorage — a menu
 * manager fixing prices and an owner checking margins want different tables,
 * and neither should have to scroll past the other's columns.
 *
 * `field` is the API field a cell writes. A column with no `field` (the size
 * expander, the checkbox) is display only. `variantField` is the equivalent on
 * a size row, absent when the column has no meaning for one — GST belongs to
 * the dish, not to its Half portion.
 */

export type ColumnKind =
  | 'text'
  | 'money'
  | 'int'
  | 'decimal'
  | 'bool'
  | 'category'
  | 'menu_group'
  | 'select';

export type GridColumn = {
  key: string;
  label: string;
  /** Grouping in the column chooser, so the list is scannable. */
  group: 'Basics' | 'Money' | 'Stock' | 'Kitchen' | 'Display';
  kind: ColumnKind;
  field?: string;
  variantField?: string;
  width?: number;
  minWidth?: number;
  /** Owner-only (recipes.manage), like every other cost surface. */
  costOnly?: boolean;
  /** Choices for `select` columns. */
  options?: Array<{ value: string; label: string }>;
  /** Shown by default on a fresh browser. */
  defaultOn: boolean;
  /** Value used when sorting by this column. */
  sortValue?: (item: MenuItem) => string | number;
};

export const TAX_CODES = [
  { value: 'standard_8', label: 'GST 8%' },
  { value: 'zero_rated', label: 'Zero-rated' },
  { value: 'exempt', label: 'Exempt' },
  { value: 'out_of_scope', label: 'Out of scope' },
];

export const SPICE_LEVELS = [
  { value: 'none', label: 'None' },
  { value: 'mild', label: 'Mild' },
  { value: 'medium', label: 'Medium' },
  { value: 'hot', label: 'Hot' },
  { value: 'extra_hot', label: 'Extra hot' },
];

export const PACKAGING_MODES = [
  { value: 'per_unit', label: 'Per unit' },
  { value: 'per_line', label: 'Per line' },
];

const str = (v: unknown) => String(v ?? '').toLowerCase();
const numOf = (v: unknown) => {
  const n = Number(v);

  return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY;
};

export const GRID_COLUMNS: GridColumn[] = [
  { key: 'name', label: 'Name', group: 'Basics', kind: 'text', field: 'name', variantField: 'name', minWidth: 200, defaultOn: true, sortValue: (i) => str(i.name) },
  { key: 'name_dv', label: 'Name (Dhivehi)', group: 'Basics', kind: 'text', field: 'name_dv', variantField: 'name_dv', minWidth: 150, defaultOn: false, sortValue: (i) => str(i.name_dv) },
  { key: 'card_name', label: 'Card name', group: 'Display', kind: 'text', field: 'card_name', minWidth: 150, defaultOn: false, sortValue: (i) => str(i.card_name) },
  { key: 'category', label: 'Category', group: 'Basics', kind: 'category', field: 'category_id', minWidth: 150, defaultOn: true, sortValue: (i) => str(i.category?.name) },
  { key: 'menu_group', label: 'Menu group', group: 'Basics', kind: 'menu_group', field: 'menu_group_id', minWidth: 140, defaultOn: false, sortValue: (i) => str(i.menu_group?.name) },
  { key: 'price', label: 'Price', group: 'Money', kind: 'money', field: 'base_price', variantField: 'price', width: 96, defaultOn: true, sortValue: (i) => numOf(i.base_price) },
  { key: 'cost', label: 'Cost', group: 'Money', kind: 'money', field: 'cost', variantField: 'cost', width: 96, costOnly: true, defaultOn: true, sortValue: (i) => numOf(i.cost) },
  { key: 'margin', label: 'Margin %', group: 'Money', kind: 'text', width: 84, costOnly: true, defaultOn: false, sortValue: (i) => {
    const price = numOf(i.base_price);
    const cost = numOf(i.effective_cost ?? i.cost);
    return price > 0 && Number.isFinite(cost) ? ((price - cost) / price) * 100 : Number.NEGATIVE_INFINITY;
  } },
  { key: 'sku', label: 'SKU', group: 'Basics', kind: 'text', field: 'sku', variantField: 'sku', minWidth: 110, defaultOn: true, sortValue: (i) => str(i.sku) },
  // A size can carry its own barcode — a large bottle scans differently from a
  // small one — so the column reaches sizes as well as dishes.
  { key: 'barcode', label: 'Barcode', group: 'Basics', kind: 'text', field: 'barcode', variantField: 'barcode', minWidth: 120, defaultOn: false, sortValue: (i) => str((i as unknown as Record<string, unknown>).barcode) },
  { key: 'gst', label: 'GST', group: 'Money', kind: 'select', field: 'tax_code', options: TAX_CODES, minWidth: 120, defaultOn: true, sortValue: (i) => str(i.tax_code) },
  { key: 'packaging_fee', label: 'Packaging fee', group: 'Money', kind: 'money', field: 'packaging_fee', width: 100, defaultOn: false, sortValue: (i) => numOf(i.packaging_fee) },
  { key: 'packaging_fee_mode', label: 'Packaging mode', group: 'Money', kind: 'select', field: 'packaging_fee_mode', options: PACKAGING_MODES, minWidth: 130, defaultOn: false, sortValue: (i) => str(i.packaging_fee_mode) },
  { key: 'price_note', label: 'Price note', group: 'Display', kind: 'text', field: 'price_note', minWidth: 120, defaultOn: false, sortValue: (i) => str(i.price_note) },
  { key: 'track_stock', label: 'Track stock', group: 'Stock', kind: 'bool', field: 'track_stock', variantField: 'track_stock', width: 80, defaultOn: false, sortValue: (i) => (i.track_stock ? 1 : 0) },
  { key: 'stock', label: 'Stock', group: 'Stock', kind: 'int', field: 'stock_quantity', variantField: 'stock_qty', width: 80, defaultOn: true, sortValue: (i) => numOf(i.stock_quantity) },
  { key: 'low_stock_threshold', label: 'Alert at', group: 'Stock', kind: 'int', field: 'low_stock_threshold', variantField: 'low_stock_threshold', width: 80, defaultOn: false, sortValue: (i) => numOf(i.low_stock_threshold) },
  { key: 'consumption_factor', label: 'Uses', group: 'Stock', kind: 'decimal', variantField: 'consumption_factor', width: 76, defaultOn: false },
  // Sizes carry their own sold-out switch — running out of large cups does
  // not mean the dish is off.
  { key: 'available', label: 'Avail', group: 'Basics', kind: 'bool', field: 'is_available', variantField: 'is_available', width: 66, defaultOn: true, sortValue: (i) => (i.is_available ? 1 : 0) },
  { key: 'active', label: 'Active', group: 'Basics', kind: 'bool', field: 'is_active', variantField: 'is_active', width: 66, defaultOn: true, sortValue: (i) => (i.is_active ? 1 : 0) },
  { key: 'prep_time_minutes', label: 'Prep min', group: 'Kitchen', kind: 'int', field: 'prep_time_minutes', width: 84, defaultOn: false, sortValue: (i) => numOf(i.prep_time_minutes) },
  { key: 'spice_level', label: 'Spice', group: 'Kitchen', kind: 'select', field: 'spice_level', options: SPICE_LEVELS, minWidth: 110, defaultOn: false, sortValue: (i) => str(i.spice_level) },
  { key: 'calories', label: 'Calories', group: 'Kitchen', kind: 'int', field: 'calories', width: 84, defaultOn: false, sortValue: (i) => numOf(i.calories) },
  { key: 'allow_pre_order', label: 'Pre-order', group: 'Kitchen', kind: 'bool', field: 'allow_pre_order', width: 80, defaultOn: false, sortValue: (i) => (i.allow_pre_order ? 1 : 0) },
  { key: 'tomorrow_daily_capacity', label: 'Tomorrow cap', group: 'Kitchen', kind: 'int', field: 'tomorrow_daily_capacity', width: 100, defaultOn: false, sortValue: (i) => numOf(i.tomorrow_daily_capacity) },
  { key: 'short_description', label: 'Short description', group: 'Display', kind: 'text', field: 'short_description', minWidth: 180, defaultOn: false, sortValue: (i) => str(i.short_description) },
  { key: 'show_on_signage', label: 'On signage', group: 'Display', kind: 'bool', field: 'show_on_signage', width: 86, defaultOn: false, sortValue: (i) => (i.show_on_signage ? 1 : 0) },
  { key: 'is_signage_promoted', label: 'Promoted', group: 'Display', kind: 'bool', field: 'is_signage_promoted', width: 84, defaultOn: false, sortValue: (i) => (i.is_signage_promoted ? 1 : 0) },
  { key: 'sort', label: 'Sort', group: 'Basics', kind: 'int', field: 'sort_order', variantField: 'sort_order', width: 70, defaultOn: true, sortValue: (i) => numOf(i.sort_order) },
];

export const COLUMN_GROUPS: Array<GridColumn['group']> = ['Basics', 'Money', 'Stock', 'Kitchen', 'Display'];

const STORAGE_KEY = 'menu-quick-edit-columns';

export function defaultVisibleColumns(canSeeCost: boolean): string[] {
  return GRID_COLUMNS.filter((c) => c.defaultOn && (canSeeCost || !c.costOnly)).map((c) => c.key);
}

/**
 * Remembered column choice, filtered to what this person may see.
 *
 * A stored choice from an owner session must not resurface a cost column for
 * a manager sharing the browser, so the permission filter is applied on read
 * as well as on write.
 */
export function loadVisibleColumns(canSeeCost: boolean): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultVisibleColumns(canSeeCost);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultVisibleColumns(canSeeCost);
    const known = new Set(GRID_COLUMNS.filter((c) => canSeeCost || !c.costOnly).map((c) => c.key));
    const kept = parsed.filter((k): k is string => typeof k === 'string' && known.has(k));

    // Never leave someone with a table of nothing but checkboxes.
    return kept.length > 0 ? kept : defaultVisibleColumns(canSeeCost);
  } catch {
    return defaultVisibleColumns(canSeeCost);
  }
}

export function saveVisibleColumns(keys: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    /* a browser refusing storage is not a reason to fail the edit */
  }
}

/** Columns in their canonical order, filtered to the chosen, visible set. */
export function visibleColumns(keys: string[], canSeeCost: boolean): GridColumn[] {
  const chosen = new Set(keys);

  return GRID_COLUMNS.filter((c) => chosen.has(c.key) && (canSeeCost || !c.costOnly));
}

/** Choices for a category cell, parents first with children indented. */
export function categoryOptions(categories: MenuCategory[]): Array<{ value: string; label: string }> {
  const parents = categories.filter((c) => !c.parent_id);
  const out: Array<{ value: string; label: string }> = [];
  for (const parent of parents) {
    out.push({ value: String(parent.id), label: parent.name });
    for (const child of categories.filter((c) => c.parent_id === parent.id)) {
      out.push({ value: String(child.id), label: `↳ ${child.name}` });
    }
  }
  // Anything orphaned still needs to be selectable.
  for (const c of categories) {
    if (!out.some((o) => o.value === String(c.id))) out.push({ value: String(c.id), label: c.name });
  }

  return out;
}

export function menuGroupOptions(groups: MenuGroupRow[]): Array<{ value: string; label: string }> {
  return groups.map((g) => ({ value: String(g.id), label: g.name }));
}

/** Margin as a percentage of price, or null when either side is unknown. */
export function marginPct(item: MenuItem): number | null {
  const price = Number(item.base_price);
  const cost = Number(item.effective_cost ?? item.cost);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(cost)) return null;

  return ((price - cost) / price) * 100;
}
