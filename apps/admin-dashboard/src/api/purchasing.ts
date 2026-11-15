import { req, requestBlob } from './client';
import type { InventoryItem } from './operations';

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
  // The reorder and price-rise alert switches are their rows in Admin → Notifications (2026-10-10).
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

/**
 * "I paid these" (owner, 2026-11-15): every order still showing as owed, for
 * one shop (by its supplier id, or by the name typed on its orders) or for all.
 */
export async function settlePayables(data: { all?: boolean; supplier_id?: number | null; name?: string }): Promise<{ message: string; settled: number; total: number }> {
  return req('/purchasing/payables/settle', { method: 'POST', body: JSON.stringify(data) });
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

// ── Supplier bills read into a manual PO (owner, 2026-11-15) ──────────────────

/** One line of goods as read off a bill. */
export type BillLine = {
  /** The line as written on the bill. */
  name: string;
  /** The inventory item it was matched to, or null when none of them is this product. */
  item_id: number | null;
  item: InventoryItem | null;
  /** For a line with no item: a name and a unit to start a new inventory item from. */
  new_name: string;
  new_unit: string;
  quantity: number;
  /** "" is the item's own unit; else a pack's name or the bill's own word. */
  unit: string;
  /** How many of the item's own unit one of that pack holds, when the bill said; else 0. */
  pack_size?: number;
  /** What one cost, as paid: GST inside. */
  unit_price: number;
  amount: number;
  gst: boolean;
  /** Hard to read, or the sum does not come to the amount: look at this one. */
  unsure: boolean;
};

export type BillData = {
  shop: string;
  bill_no: string;
  date: string | null;
  total: number;
  gst_total: number;
  note: string;
  lines: BillLine[];
  lines_total: number;
  /** A purchase already on file with this bill number. */
  seen_before: { purchase_id: number; purchase_date: string | null } | null;
};

export type PurchaseBill = {
  id: number;
  status: 'queued' | 'reading' | 'ready' | 'failed';
  file_name: string;
  is_image: boolean;
  error: string | null;
  sent_at: string | null;
  data: BillData | null;
};

export async function fetchPurchaseBills(): Promise<{ enabled: boolean; bills: PurchaseBill[] }> {
  return req('/purchases/bills');
}

/** Keep one bill (a photo or a PDF). It is not read yet: call readPurchaseBill. */
export async function sendPurchaseBill(file: File): Promise<{ bill: PurchaseBill }> {
  const body = new FormData();
  body.append('file', file);
  return req('/purchases/bills', { method: 'POST', body });
}

/** Read it now. Takes a few seconds; also "Try again" on one that failed. */
export async function readPurchaseBill(id: number): Promise<{ bill: PurchaseBill }> {
  return req(`/purchases/bills/${id}/read`, { method: 'POST' });
}

export async function removePurchaseBill(id: number): Promise<{ ok: boolean }> {
  return req(`/purchases/bills/${id}`, { method: 'DELETE' });
}

export async function downloadPurchaseBill(id: number): Promise<Blob> {
  return requestBlob(`/purchases/bills/${id}/file`, {});
}

/** Which service reads supplier bills (Purchasing → Settings → Reading bills). A key is never sent back. */
export type BillReaderProvider = {
  key: string;
  label: string;
  /** Where to get a key, in words. */
  where: string;
  has_key: boolean;
  /** "…9f3c": the last four of the key in use. */
  key_hint: string | null;
  /** Typed here, or sitting in the server's .env. */
  key_from: 'admin' | 'env' | null;
  model: string;
  default_model: string;
};

export type BillReaderSettings = {
  provider: string;
  providers: BillReaderProvider[];
  /** The names a bill may be made out to, comma separated: the business and its parent company. */
  our_names: string;
};

export async function getBillReader(): Promise<BillReaderSettings> {
  return req('/purchasing/bill-reader');
}

/** A key that is sent replaces the stored one; "" removes it; left out, it is kept. */
export async function saveBillReader(data: {
  provider?: string; keys?: Record<string, string>; models?: Record<string, string>; our_names?: string;
}): Promise<BillReaderSettings> {
  return req('/purchasing/bill-reader', { method: 'PUT', body: JSON.stringify(data) });
}

/** Sends a made-up bill to the service. Costs one small read. */
export async function testBillReader(provider: string): Promise<{ ok: boolean; message: string }> {
  return req('/purchasing/bill-reader/test', { method: 'POST', body: JSON.stringify({ provider }) });
}
