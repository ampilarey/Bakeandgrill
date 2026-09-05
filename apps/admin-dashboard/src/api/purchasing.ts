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
