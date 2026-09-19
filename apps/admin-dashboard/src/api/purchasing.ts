import { req } from './client';

/**
 * Every switch that governs buying — one call, one screen.
 *
 * Purchasing settings audit, 2026-09-05: these thirteen were spread across
 * four screens and four had no screen at all. Nothing here is a new setting;
 * each field is the key its service already reads, so this is the same switch
 * in one place rather than a second set wired to nothing.
 */
export interface PurchasingSettings {
  // Requesting
  auto_request_on_low_stock: boolean;
  recurring_lists_enabled: boolean;
  // Approving
  auto_approve_under_mvr: number;
  // Buying
  show_price_hints: boolean;
  backdate_max_days: number;
  // Receiving
  stock_variance_reason_mvr: number;
  // Costing
  auto_expense_on_verify: boolean;
  default_expense_category_id: number | null;
  auto_expense_non_stock_purchases: boolean;
  enforce_expense_budgets: boolean;
  // Restocking
  restock_include_waste: boolean;
  restock_high_waste_pct: number;
  reorder_alert_sms: boolean;
  /** For the category picker, so the screen needs one request. */
  expense_categories: Array<{ id: number; name: string }>;
}

export type PurchasingSettingsPatch = Partial<Omit<PurchasingSettings, 'expense_categories'>>;

export async function getPurchasingSettings(): Promise<{ settings: PurchasingSettings }> {
  return req('/purchasing/settings');
}

export async function updatePurchasingSettings(
  patch: PurchasingSettingsPatch,
): Promise<{ settings: PurchasingSettings; message: string }> {
  return req('/purchasing/settings', { method: 'PATCH', body: JSON.stringify(patch) });
}

/*
 * Price changes — what each thing we buy costs now against before.
 *
 * Owner, 2026-09-19: "Where i can see the price difference of each product
 * over time. An easy way to". Every receipt already wrote a price row; this
 * is the first screen that reads them all at once.
 */
export interface PricePoint {
  price: number;
  date: string;
  supplier: string | null;
  brand: string | null;
}

export interface PriceChangeItem {
  item_id: number;
  name: string;
  unit: string;
  photo_url: string | null;
  last: PricePoint;
  previous: PricePoint | null;
  month_ago: PricePoint | null;
  /** Last buy against the one before, in percent, or null when bought once. */
  change_pct: number | null;
  /** Last buy against the latest price at least 30 days old. */
  change_pct_month: number | null;
  purchases_90d: number;
  sparkline: Array<{ date: string; price: number }>;
}

export interface PriceChangesSummary {
  items: number;
  up_over_10: number;
  up: number;
  down: number;
  unchanged: number;
  single_price: number;
}

export async function fetchPriceChanges(): Promise<{ items: PriceChangeItem[]; summary: PriceChangesSummary }> {
  return req('/purchasing/price-changes');
}

export interface ItemPriceHistoryPoint extends PricePoint {
  purchase_id: number | null;
  purchase_number: string | null;
}

export async function fetchItemPriceHistory(itemId: number): Promise<{
  item: { id: number; name: string; unit: string; photo_url: string | null };
  points: ItemPriceHistoryPoint[];
}> {
  return req(`/purchasing/price-changes/${itemId}`);
}
