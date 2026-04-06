import { BASE, req } from './client';

// ── Invoices ──────────────────────────────────────────────────────────────────

export type InvoiceItem = {
  id: number;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  total: number;
  tax_rate_bp: number;
  item: { id: number; name: string } | null;
  inventory_item: { id: number; name: string } | null;
};

export type Invoice = {
  id: number;
  invoice_number: string;
  type: 'sale' | 'purchase' | 'credit_note';
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | 'void';
  recipient_name: string | null;
  recipient_phone: string | null;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  tax_rate_bp: number;
  issue_date: string;
  due_date: string | null;
  paid_at: string | null;
  payment_method: string | null;
  notes: string | null;
  customer: { id: number; name: string; phone: string } | null;
  supplier: { id: number; name: string } | null;
  order_id: number | null;
  purchase_id: number | null;
  created_by: string | null;
  items: InvoiceItem[];
  created_at: string;
};

export interface CreditNote {
  id: number;
  invoice_number: string;
  total: number;
  status: string;
  created_at: string;
}

export async function getInvoices(params: { type?: string; status?: string; from?: string; to?: string; page?: number } = {}): Promise<{ data: Invoice[]; meta: { total: number; current_page: number; last_page: number } }> {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
  return req(`/invoices?${q}`);
}

export async function getInvoice(id: number): Promise<{ invoice: Invoice }> {
  return req(`/invoices/${id}`);
}

export async function markInvoiceSent(id: number): Promise<{ invoice: Invoice }> {
  return req(`/invoices/${id}/mark-sent`, { method: 'POST' });
}

export async function markInvoicePaid(id: number, method: string, reference?: string): Promise<{ invoice: Invoice }> {
  return req(`/invoices/${id}/mark-paid`, { method: 'POST', body: JSON.stringify({ payment_method: method, payment_reference: reference }) });
}

export async function voidInvoice(id: number): Promise<{ invoice: Invoice }> {
  return req(`/invoices/${id}/void`, { method: 'POST' });
}

export async function sendInvoiceToCustomer(id: number, phone: string): Promise<{ invoice: Invoice; link: string }> {
  return req(`/invoices/${id}/send`, { method: 'POST', body: JSON.stringify({ phone }) });
}

export async function updateInvoice(id: number, data: Partial<{
  recipient_name: string;
  recipient_phone: string;
  due_date: string | null;
  notes: string | null;
  items: { description: string; quantity: number; unit_price: number; tax_rate_bp?: number }[];
}>): Promise<{ invoice: Invoice }> {
  return req(`/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function createCreditNote(invoiceId: number, data: {
  reason: string;
  amount: number;
  items?: { description: string; quantity: number; unit_price: number }[];
}): Promise<{ credit_note: CreditNote }> {
  return req(`/invoices/${invoiceId}/credit-note`, { method: 'POST', body: JSON.stringify(data) });
}

export async function generateInvoicePdf(id: number): Promise<Blob> {
  const token = localStorage.getItem('admin_token');
  const res = await fetch(`${BASE}/invoices/${id}/pdf`, {
    headers: {
      Accept: 'application/pdf',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`PDF generation failed (${res.status})`);
  return res.blob();
}

export async function createInvoiceFromOrder(orderId: number): Promise<{ invoice: Invoice }> {
  return req(`/invoices/from-order/${orderId}`, { method: 'POST' });
}

export async function createInvoiceFromPurchase(purchaseId: number): Promise<{ invoice: Invoice }> {
  return req(`/invoices/from-purchase/${purchaseId}`, { method: 'POST' });
}

export async function pushInvoiceToXero(id: number): Promise<{ xero_invoice_id: string }> {
  return req(`/xero/invoices/${id}/push`, { method: 'POST' });
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export type ExpenseCategory = { id: number; name: string; icon: string; slug: string };

export type Expense = {
  id: number;
  expense_number: string;
  description: string;
  amount: number;
  tax_amount: number;
  total: number;
  payment_method: string | null;
  reference_number: string | null;
  expense_date: string;
  status: 'pending' | 'approved' | 'rejected';
  is_recurring: boolean;
  recurrence_interval: string | null;
  next_recurrence_date: string | null;
  receipt_path: string | null;
  notes: string | null;
  category: { id: number; name: string; icon: string } | null;
  supplier: { id: number; name: string } | null;
  logged_by: string | null;
  created_at: string;
};

export async function getExpenses(params: { category_id?: number; from?: string; to?: string; status?: string; page?: number } = {}): Promise<{ data: Expense[]; meta: { total: number; current_page: number; last_page: number }; total_amount: number }> {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
  return req(`/expenses?${q}`);
}

export async function getExpenseCategories(): Promise<{ categories: ExpenseCategory[] }> {
  return req('/expenses/categories');
}

export async function storeExpense(data: Record<string, unknown>): Promise<{ expense: Expense }> {
  return req('/expenses', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateExpense(id: number, data: Record<string, unknown>): Promise<{ expense: Expense }> {
  return req(`/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteExpense(id: number): Promise<void> {
  return req(`/expenses/${id}`, { method: 'DELETE' });
}

export async function getExpense(id: number): Promise<{ expense: Expense }> {
  return req(`/expenses/${id}`);
}

export async function getExpenseSummary(from: string, to: string): Promise<{ total: number; by_category: { category: string; icon: string; total: number; count: number; pct: number }[] }> {
  return req(`/expenses/summary?from=${from}&to=${to}`);
}

export async function uploadExpenseReceipt(id: number, file: File): Promise<{ expense: Expense }> {
  const token = localStorage.getItem('admin_token');
  const form = new FormData();
  form.append('receipt', file);
  const res = await fetch(`${BASE}/expenses/${id}/receipt`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? `Upload failed (${res.status})`);
  }
  return res.json() as Promise<{ expense: Expense }>;
}

export async function approveExpense(id: number): Promise<{ expense: Expense }> {
  return req(`/expenses/${id}/approve`, { method: 'POST' });
}

export async function pushExpenseToXero(id: number): Promise<{ xero_id: string }> {
  return req(`/xero/expenses/${id}/push`, { method: 'POST' });
}

// ── P&L / Cash Flow / Daily Summary ──────────────────────────────────────────

export type PnLReport = {
  from: string; to: string;
  revenue: { gross: number; tax: number; discounts: number; net: number; orders: number };
  cogs: number;
  gross_profit: number;
  gross_margin_pct: number;
  expenses: { total: number; by_category: { category: string; icon: string; total: number }[] };
  waste_cost: number;
  operating_profit: number;
  net_profit_margin_pct: number;
};

export async function getProfitAndLoss(from: string, to: string): Promise<PnLReport> {
  return req(`/reports/finance/profit-and-loss?from=${from}&to=${to}`);
}

export async function getCashFlow(from: string, to: string): Promise<{ total_inflow: number; total_outflow: number; net_cash_flow: number; days: { date: string; inflow: number; outflow: number; net: number; running_balance: number }[] }> {
  return req(`/reports/finance/cash-flow?from=${from}&to=${to}`);
}

export async function getDailySummary(date: string): Promise<{ date: string; revenue: number; tax: number; orders: number; avg_order: number; expenses: number; purchases: number; waste_cost: number; net_profit: number; by_type: { type: string; count: number; revenue: number }[]; top_items: { name: string; qty: number; revenue: number }[] }> {
  return req(`/reports/finance/daily-summary?date=${date}`);
}

// ── Reports ───────────────────────────────────────────────────────────────────

export type SalesSummary = {
  total_revenue: number;
  order_count: number;
  average_order_value: number;
  period: string;
  payments?: Record<string, number>;
};

export async function fetchSalesSummary(params?: {
  from?: string;
  to?: string;
}): Promise<SalesSummary> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  const res = await req<{
    from: string;
    to: string;
    totals: { orders_count: number; total: number; subtotal: number };
    payments: Record<string, number>;
  }>(`/reports/sales-summary?${qs}`);
  const order_count = res.totals?.orders_count ?? 0;
  const total_revenue = res.totals?.total ?? 0;
  return {
    total_revenue,
    order_count,
    average_order_value: order_count > 0 ? total_revenue / order_count : 0,
    period: `${res.from} – ${res.to}`,
    payments: res.payments,
  };
}

export interface SalesBreakdown {
  from: string;
  to: string;
  by_category: { category: string; revenue: number; orders: number }[];
  by_type: { type: string; revenue: number; orders: number }[];
  by_hour: { hour: number; revenue: number; orders: number }[];
  top_items: { id: number; name: string; qty: number; revenue: number }[];
}

export async function getSalesBreakdown(params: { from: string; to: string }): Promise<SalesBreakdown> {
  const qs = new URLSearchParams(params);
  return req(`/reports/sales-breakdown?${qs}`);
}

export interface XReport {
  generated_at: string;
  from: string;
  to: string;
  totals: { orders: number; revenue: number; tax: number; discounts: number };
  by_type: { type: string; count: number; total: number }[];
  by_payment: Record<string, number>;
}

export async function getXReport(): Promise<XReport> {
  return req('/reports/x-report');
}

export interface ZReport extends XReport {
  shift_id: number | null;
  closed_at: string | null;
}

export async function getZReport(): Promise<ZReport> {
  return req('/reports/z-report');
}

export interface InventoryValuation {
  total_value: number;
  items: { id: number; name: string; unit: string; quantity: number; cost_per_unit: number; total_value: number }[];
}

export async function getInventoryValuation(): Promise<InventoryValuation> {
  return req('/reports/inventory-valuation');
}

export interface TaxReport {
  from: string;
  to: string;
  total_tax_collected: number;
  by_rate: { rate_bp: number; rate_pct: number; net_sales: number; tax_amount: number }[];
}

export async function getTaxReport(params: { from: string; to: string }): Promise<TaxReport> {
  const qs = new URLSearchParams(params);
  return req(`/reports/finance/tax?${qs}`);
}

export interface AccountsPayable {
  supplier_id: number;
  supplier_name: string;
  outstanding_amount: number;
  invoices: { id: number; invoice_number: string; amount: number; due_date: string | null }[];
}

export async function getAccountsPayable(): Promise<{ data: AccountsPayable[] }> {
  return req('/reports/finance/accounts-payable');
}

export interface AccountsReceivable {
  customer_id: number | null;
  customer_name: string | null;
  outstanding_amount: number;
  invoices: { id: number; invoice_number: string; amount: number; due_date: string | null }[];
}

export async function getAccountsReceivable(): Promise<{ data: AccountsReceivable[] }> {
  return req('/reports/finance/accounts-receivable');
}

// ── Purchase Orders ───────────────────────────────────────────────────────────

export interface Purchase {
  id: number;
  purchase_number: string;
  supplier_id: number;
  supplier?: { id: number; name: string };
  status: string;
  total: number;
  expected_delivery?: string;
  notes?: string;
  created_at: string;
}

export async function fetchPurchases(params?: { status?: string; page?: number }): Promise<{
  purchases: { data: Purchase[]; current_page: number; last_page: number; total: number };
}> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.page) qs.set('page', String(params.page));
  const query = qs.toString() ? `?${qs}` : '';
  return req(`/purchases${query}`);
}

export async function approvePurchase(id: number): Promise<void> {
  await req(`/purchases/${id}/approve`, { method: 'POST' });
}

export async function rejectPurchase(id: number, reason: string): Promise<void> {
  await req(`/purchases/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
}

export async function getPurchase(id: number): Promise<{ purchase: Purchase }> {
  return req(`/purchases/${id}`);
}

export async function receivePurchase(id: number, data: {
  items: { purchase_item_id: number; received_quantity: number }[];
  notes?: string;
}): Promise<void> {
  await req(`/purchases/${id}/receive`, { method: 'POST', body: JSON.stringify(data) });
}

export async function createPurchaseFromSuggest(data: {
  supplier_id: number;
  items: { inventory_item_id: number; quantity: number; unit_cost: number }[];
  expected_delivery?: string;
  notes?: string;
}): Promise<{ purchase: Purchase }> {
  return req('/purchases/from-suggest', { method: 'POST', body: JSON.stringify(data) });
}

export type PurchaseSuggestions = {
  items: {
    inventory_item_id: number;
    name: string;
    unit: string;
    current_stock: number;
    reorder_point: number;
    suggested_quantity: number;
    suggested_supplier: { id: number; name: string; price: number } | null;
  }[];
  by_supplier: {
    supplier_id: number | null;
    supplier_name: string;
    items: unknown[];
    estimated_total: number;
  }[];
};

export async function getPurchaseSuggestions(): Promise<PurchaseSuggestions> {
  return req('/purchases/suggest');
}

// ── Forecasts ─────────────────────────────────────────────────────────────────

export async function getSalesTrends(params: { granularity?: string; from?: string; to?: string } = {}): Promise<{ total_revenue: number; total_orders: number; data: { period: string; revenue: number; orders: number; growth_pct: number | null }[] }> {
  const q = new URLSearchParams(params as Record<string, string>);
  return req(`/forecasts/trends?${q}`);
}

export async function getRevenueForecast(weeks = 8, horizon = 4): Promise<{ weighted_moving_avg: number; growth_rate_pct: number; forecast: { week_start: string; projected_revenue: number }[] }> {
  return req(`/forecasts/revenue?weeks=${weeks}&horizon=${horizon}`);
}

export async function getInventoryForecast(): Promise<{ items: { id: number; name: string; unit: string; category: string; current_stock: number; daily_usage_rate: number; days_of_stock: number | null; status: string }[] }> {
  return req('/forecasts/inventory');
}

export interface ItemForecast {
  item_id: number;
  item_name: string;
  forecast: { date: string; predicted_qty: number; predicted_revenue: number }[];
}

export async function getItemForecast(params: { item_id: number; days?: number }): Promise<ItemForecast> {
  const qs = new URLSearchParams({ item_id: String(params.item_id) });
  if (params.days) qs.set('days', String(params.days));
  return req(`/forecasts/items?${qs}`);
}

// ── Supplier Intelligence ─────────────────────────────────────────────────────

export type SupplierPerf = {
  supplier_id: number; supplier_name: string; is_active: boolean;
  purchase_count: number; total_spend: number; overall_rating: number | null;
  avg_quality: number | null; avg_delivery: number | null;
};

export async function getSupplierPerformance(): Promise<{ suppliers: SupplierPerf[] }> {
  return req('/suppliers/performance');
}

export async function rateSupplier(supplierId: number, data: Record<string, unknown>): Promise<{ rating: Record<string, unknown> }> {
  return req(`/suppliers/${supplierId}/ratings`, { method: 'POST', body: JSON.stringify(data) });
}

export async function getPriceComparison(inventoryItemId: number): Promise<{ inventory_item_id: number; prices: { supplier_id: number; supplier_name: string; unit_price: number; unit: string; recorded_at: string }[]; cheapest: { supplier_id: number; supplier_name: string; unit_price: number } | null }> {
  return req(`/suppliers/price-comparison/${inventoryItemId}`);
}

export interface SupplierRating {
  id: number;
  purchase_id: number | null;
  quality_score: number;
  delivery_score: number;
  pricing_score: number;
  overall_score: number;
  comment: string | null;
  rated_by: string | null;
  created_at: string;
}

export async function getSupplierRatings(supplierId: number): Promise<{ data: SupplierRating[] }> {
  return req(`/suppliers/${supplierId}/ratings`);
}

export async function getSupplierPerformanceSingle(supplierId: number): Promise<{
  supplier: { id: number; name: string };
  purchase_count: number;
  total_spend: number;
  avg_quality: number | null;
  avg_delivery: number | null;
  avg_pricing: number | null;
  on_time_rate: number | null;
}> {
  return req(`/suppliers/${supplierId}/performance`);
}

export async function refreshSupplierCache(supplierId: number): Promise<void> {
  await req(`/suppliers/${supplierId}/performance/refresh`, { method: 'POST' });
}

export interface PriceHistory {
  unit_price: number;
  unit: string;
  recorded_at: string;
  purchase_id: number | null;
}

export async function getSupplierPriceHistory(supplierId: number, itemId: number): Promise<{ data: PriceHistory[] }> {
  return req(`/suppliers/${supplierId}/price-history/${itemId}`);
}

// ── Xero Integration ──────────────────────────────────────────────────────────

export interface XeroStatus {
  connected: boolean;
  organisation_name: string | null;
  connected_at: string | null;
  last_sync_at: string | null;
}

export async function getXeroStatus(): Promise<XeroStatus> {
  return req('/xero/status');
}

export async function getXeroConnectUrl(): Promise<{ redirect_url: string }> {
  return req('/xero/connect');
}

export async function disconnectXero(): Promise<void> {
  await req('/xero/disconnect', { method: 'POST' });
}

export interface XeroLog {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  status: 'success' | 'failed';
  message: string | null;
  created_at: string;
}

export async function getXeroLogs(params?: { page?: number }): Promise<{ data: XeroLog[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  return req(`/xero/logs?${qs}`);
}
