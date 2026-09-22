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
  /** Monday SMS of the items up 10%+ on their last buy (owner, 2026-09-21). */
  price_rise_alert_sms: boolean;
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

/*
 * One supplier, everything bought from them.
 *
 * Owner, 2026-09-20: "in suppliers list, when clicked, can u add advanced
 * features to know all the po and items bought from each supplier". The
 * orders themselves come from fetchPurchases({ supplier_id }).
 */
export interface SupplierCard {
  id: number;
  name: string;
  contact_name: string | null;
  phone: string | null;
  extra_phones: string[];
  email: string | null;
  address: string | null;
  tin: string | null;
  payment_terms: string | null;
  lead_days: number | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  notes: string | null;
  is_active: boolean;
}

export interface SupplierOverview {
  supplier: SupplierCard;
  /** What is still to pay them (owner, 2026-09-21). */
  owed: { amount: number; orders: number; oldest_date: string | null };
  orders: {
    count: number;
    spend: number;
    average: number | null;
    first_date: string | null;
    last_date: string | null;
    days_between: number | null;
    on_time: { on_time: number; timed: number; rate: number } | null;
    by_status: Record<string, number>;
    open: number;
  };
  items: { count: number; top: Array<{ item_id: number; name: string; spend: number; orders: number }> };
  monthly: Array<{ month: string; spend: number; orders: number }>;
  ratings: { count: number; quality: number | null; delivery: number | null; accuracy: number | null; price: number | null; overall: number | null };
}

export interface SupplierItem {
  item_id: number;
  name: string;
  unit: string;
  photo_url: string | null;
  is_active: boolean;
  orders: number;
  quantity: number;
  spend: number;
  first: { price: number; date: string | null };
  last: { price: number; date: string | null; brand: string | null; purchase_number: string; quantity: number };
  change_pct: number | null;
  elsewhere: { supplier: string | null; price: number; date: string; cheaper: boolean } | null;
  /** What we paid this shop each time, oldest first, for the chart. */
  points: Array<{ date: string | null; price: number; brand: string | null; purchase_number: string }>;
}

export async function fetchSupplierOverview(supplierId: number): Promise<SupplierOverview> {
  return req(`/purchasing/suppliers/${supplierId}/overview`);
}

export async function fetchSupplierItems(supplierId: number): Promise<{ supplier: SupplierCard; items: SupplierItem[] }> {
  return req(`/purchasing/suppliers/${supplierId}/items`);
}

/** What GET /suppliers/{id}/ratings actually returns per row. */
export interface SupplierRatingRow {
  id: number;
  quality_score: number;
  delivery_score: number;
  accuracy_score: number;
  price_score: number;
  overall: number;
  notes: string | null;
  purchase: { id: number; number: string } | null;
  rated_by: string | null;
  created_at: string;
}

export async function fetchSupplierRatings(supplierId: number): Promise<{ data: SupplierRatingRow[] }> {
  return req(`/suppliers/${supplierId}/ratings`);
}

/*
 * What is owed to whom (owner, 2026-09-21: close the buying loop). Every
 * placed, uncancelled order with money still to pay, per shop.
 */
export interface PayableRow {
  supplier_id: number | null;
  name: string;
  owed: number;
  orders: number;
  oldest_date: string | null;
  oldest_number: string;
}

export async function fetchPayables(): Promise<{ suppliers: PayableRow[]; total_owed: number; orders: number }> {
  return req('/purchasing/payables');
}

/**
 * The slice of that debt which only looks unpaid because payment tracking
 * started after those orders were placed (owner, 2026-09-21).
 */
export interface LegacyPayables {
  before: string;
  total: number;
  orders: number;
  suppliers: Omit<PayableRow, 'supplier_id'>[];
}

export async function fetchLegacyPayables(): Promise<LegacyPayables> {
  return req('/purchasing/payables/legacy');
}

export async function settleLegacyPayables(data: { before?: string; except?: string[] } = {}): Promise<{ message: string; settled: number; total: number }> {
  return req('/purchasing/payables/legacy/settle', { method: 'POST', body: JSON.stringify(data) });
}

export type PurchasePaymentMethod = 'cash' | 'transfer' | 'other';

/** Record money out against an order. No amount means the rest of it. */
export async function recordPurchasePayment(purchaseId: number, data: {
  amount?: number; paid_on?: string; method?: PurchasePaymentMethod; reference?: string;
}): Promise<{ message: string; purchase: Record<string, unknown> }> {
  return req(`/purchases/${purchaseId}/payment`, { method: 'POST', body: JSON.stringify(data) });
}

export async function clearPurchasePayment(purchaseId: number): Promise<{ message: string }> {
  return req(`/purchases/${purchaseId}/payment`, { method: 'DELETE' });
}
