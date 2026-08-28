import { BASE, req, requestBlob } from './client';

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
  is_tax_invoice?: boolean;
  customer_tin?: string | null;
  credit_note_reason?: string | null;
  customer: { id: number; name: string; phone: string } | null;
  supplier: { id: number; name: string } | null;
  order_id: number | null;
  order?: { id: number; order_number: string } | null;
  purchase_id: number | null;
  purchase?: { id: number; purchase_number: string } | null;
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

export async function getInvoices(params: { type?: string; status?: string; from?: string; to?: string; page?: number; per_page?: number; search?: string } = {}): Promise<{ data: Invoice[]; meta: { total: number; current_page: number; last_page: number } }> {
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
  return requestBlob(`/invoices/${id}/pdf`, {
    headers: { Accept: 'application/pdf' },
  });
}

export async function createInvoiceFromOrder(orderId: number): Promise<{ invoice: Invoice }> {
  return req(`/invoices/from-order/${orderId}`, { method: 'POST' });
}

export async function createInvoiceFromPurchase(purchaseId: number): Promise<{ invoice: Invoice }> {
  return req(`/invoices/from-purchase/${purchaseId}`, { method: 'POST' });
}

export async function pushInvoiceToXero(id: number): Promise<{ message: string }> {
  return req(`/xero/invoices/${id}/push`, { method: 'POST' });
}

export interface ManualInvoiceLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  unit?: string;
  tax_rate_bp?: number;
}

export async function createInvoice(data: {
  type: 'sale' | 'purchase' | 'credit_note';
  recipient_name?: string;
  recipient_phone?: string;
  recipient_email?: string;
  recipient_address?: string;
  issue_date: string;
  due_date?: string;
  tax_rate_bp?: number;
  notes?: string;
  terms?: string;
  items: ManualInvoiceLineItem[];
}): Promise<{ invoice: Invoice }> {
  return req('/invoices', { method: 'POST', body: JSON.stringify(data) });
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export type ExpenseCategory = {
  id: number;
  name: string;
  icon: string;
  slug: string;
  monthly_budget_laar?: number | null;
  spent_this_month_laar?: number;
  budget_pct?: number | null;
  over_budget?: boolean;
  near_budget?: boolean;
};

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
  supplier_tin?: string | null;
  supplier_invoice_no?: string | null;
  supplier_invoice_date?: string | null;
  amount_excluding_gst_laar?: number | null;
  gst_rate_bp?: number | null;
  gst_laar?: number | null;
  is_input_tax_claimable?: boolean;
  revenue_or_capital?: 'revenue' | 'capital' | null;
  category: { id: number; name: string; icon: string } | null;
  supplier: { id: number; name: string } | null;
  purchase_id?: number | null;
  purchase?: { id: number; purchase_number: string; total?: number } | null;
  logged_by: string | null;
  payment_id?: number | null;
  is_auto?: boolean;
  created_at: string;
};

export async function getExpenses(params: {
  category_id?: number; from?: string; to?: string; status?: string; page?: number; search?: string;
} = {}): Promise<{ data: Expense[]; meta: { total: number; current_page: number; last_page: number }; total_amount: number }> {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
  return req(`/expenses?${q}`);
}

export async function getExpenseCategories(): Promise<{ categories: ExpenseCategory[] }> {
  return req('/expenses/categories');
}

export async function updateExpenseCategoryBudget(
  id: number,
  monthly_budget_laar: number | null,
): Promise<{ category: ExpenseCategory }> {
  return req(`/expenses/categories/${id}/budget`, {
    method: 'PATCH',
    body: JSON.stringify({ monthly_budget_laar }),
  });
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

export type PurchaseAutoExpenseSettings = {
  auto_expense_non_stock_purchases: boolean;
};

export async function getPurchaseAutoExpenseSettings(): Promise<{ settings: PurchaseAutoExpenseSettings }> {
  return req('/expenses/settings/purchase-auto');
}

export async function updatePurchaseAutoExpenseSettings(
  data: Partial<PurchaseAutoExpenseSettings>,
): Promise<{ settings: PurchaseAutoExpenseSettings; message: string }> {
  return req('/expenses/settings/purchase-auto', { method: 'PATCH', body: JSON.stringify(data) });
}

export async function uploadExpenseReceipt(id: number, file: File): Promise<{ expense: Expense }> {
  const form = new FormData();
  form.append('receipt', file);
  return req(`/expenses/${id}/receipt`, { method: 'POST', body: form });
}

export async function approveExpense(id: number): Promise<{ expense: Expense }> {
  return req(`/expenses/${id}/approve`, { method: 'POST' });
}

export async function pushExpenseToXero(id: number): Promise<{ message: string }> {
  return req(`/xero/expenses/${id}/push`, { method: 'POST' });
}

// ── P&L / Cash Flow / Daily Summary ──────────────────────────────────────────

export type PnLReport = {
  from: string; to: string;
  revenue: {
    gross: number;
    tax: number;
    discounts?: number;
    net: number;
    orders: number;
    wholesale?: number;
    wholesale_tax?: number;
    combined_net?: number;
  };
  cogs: number;
  wholesale_cogs?: number;
  wholesale_waste_cost?: number;
  wholesale?: {
    invoices_count: number;
    revenue_laar: number;
    revenue: number;
    cogs_laar: number;
    cogs: number;
  };
  gross_profit: number;
  gross_margin_pct: number;
  expenses: { total: number; by_category: { category: string; icon: string; total: number }[] };
  waste_cost: number;
  payment_processing_fees?: number;
  payment_commission?: PaymentCommissionSummary;
  operating_profit: number;
  net_profit_margin_pct: number;
};

export async function getProfitAndLoss(from: string, to: string): Promise<PnLReport> {
  return req(`/reports/finance/profit-and-loss?from=${from}&to=${to}`);
}

export type BreakEvenSeed = {
  from: string;
  to: string;
  days_in_window: number;
  revenue_ex_gst: number;
  variable_cost: number;
  fixed_cost: number;
  contribution_margin_ratio: number;
  fixed_cost_monthly: number;
  avg_daily_revenue_ex_gst: number;
  break_even_revenue_monthly: number | null;
  break_even_revenue_daily: number | null;
  currently_covers: boolean | null;
  components: {
    retail_revenue_ex_gst: number;
    wholesale_revenue_ex_gst: number;
    purchase_cogs_ex_gst: number;
    wholesale_cogs: number;
    operating_expenses: number;
    waste: number;
    refunds: number;
  };
};

export async function getBreakEvenSeed(from: string, to: string): Promise<BreakEvenSeed> {
  return req(`/reports/finance/break-even?from=${from}&to=${to}`);
}

export async function getCashFlow(from: string, to: string): Promise<{
  total_inflow: number;
  total_wholesale_inflow?: number;
  total_outflow: number;
  net_cash_flow: number;
  days: {
    date: string;
    inflow: number;
    wholesale_inflow?: number;
    outflow: number;
    net: number;
    running_balance: number;
  }[];
}> {
  return req(`/reports/finance/cash-flow?from=${from}&to=${to}`);
}

export type DailySummaryForeignCurrency = {
  shift_id: number;
  user_id: number | null;
  variance: number;
  currency: string;
  denomination: number;
  count: number;
  accepted_mvr: number;
};

export async function getDailySummary(date: string): Promise<{
  date: string;
  revenue: number;
  refunds?: number;
  tax: number;
  orders: number;
  avg_order: number;
  expenses: number;
  purchases: number;
  waste_cost: number;
  wholesale_revenue?: number;
  wholesale_cogs?: number;
  wholesale_waste_cost?: number;
  payment_processing_fees?: number;
  payment_commission?: PaymentCommissionSummary;
  net_profit: number;
  foreign_currency_held?: DailySummaryForeignCurrency[];
  by_type: { type: string; count: number; revenue: number }[];
  top_items: { name: string; qty: number; revenue: number }[];
  wholesale_top_items?: { item_name: string; quantity: number; total: number; channel: string }[];
}> {
  return req(`/reports/finance/daily-summary?date=${date}`);
}

export type SpendHubReport = {
  from: string;
  to: string;
  note: string;
  totals: {
    purchases: number;
    expenses_approved: number;
    expenses_pending: number;
    expenses_rejected: number;
    waste_cost: number;
    waste_count: number;
    combined_outflow: number;
    total_with_waste: number;
    po_count: number;
    expenses_linked_to_po: number;
  };
  purchases: {
    by_supplier: { supplier_id: number | null; supplier_name: string; po_count: number; total: number }[];
    top_items: { inventory_item_id: number | null; item_name: string; unit: string; qty: number; spend: number }[];
  };
  expenses: {
    by_category: { category: string; icon: string | null; total: number; count: number }[];
    by_status: { approved: number; pending: number; rejected: number };
  };
  waste: {
    by_reason: { reason: string; count: number; total: number }[];
  };
  daily: {
    date: string;
    purchases: number;
    expenses: number;
    waste: number;
    total: number;
    total_with_waste: number;
  }[];
};

export async function getSpendHub(from: string, to: string): Promise<SpendHubReport> {
  return req(`/reports/finance/spend-hub?from=${from}&to=${to}`);
}

// ── Reports ───────────────────────────────────────────────────────────────────

export type PaymentCommissionChannel = {
  channel: string;
  label: string;
  gross: number;
  commission: number;
  net: number;
  rate_bp: number;
  rate_percent: number;
};

export type PaymentCommissionSummary = {
  enabled: boolean;
  rates: { pos_card_rate_bp: number; online_gateway_rate_bp: number };
  totals: { gross_commissionable: number; commission_total: number; net_settlement: number };
  by_channel: PaymentCommissionChannel[];
  by_method: { method: string; method_label?: string; channel: string; gross: number; commission: number; net: number }[];
};

export type SalesSummary = {
  total_revenue: number;
  order_count: number;
  average_order_value: number;
  period: string;
  service_charge_total?: number;
  delivery_fee_total?: number;
  payments?: Record<string, number>;
  payment_commission?: PaymentCommissionSummary;
  /** FIX 7 — total of tenders that actually moved money. */
  collected_laar?: number;
  collected?: number;
  /** FIX 7 — total of house_account tenders (a receivable, not real cash). */
  on_credit_laar?: number;
  on_credit?: number;
  /** Stage F — wholesale channel (sibling to retail; not merged into total_revenue). */
  wholesale_revenue?: number;
  wholesale_invoices?: number;
};

export async function fetchSalesSummary(params?: {
  from?: string;
  to?: string;
  user_id?: number;
  shift_id?: number;
  device_id?: number;
}): Promise<SalesSummary> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  if (params?.user_id) qs.set('user_id', String(params.user_id));
  if (params?.shift_id) qs.set('shift_id', String(params.shift_id));
  if (params?.device_id) qs.set('device_id', String(params.device_id));
  const res = await req<{
    from: string;
    to: string;
    totals: { orders_count: number; total: number; subtotal: number; service_charge_total?: number; delivery_fee_total?: number };
    payments: Record<string, number>;
    payment_commission?: PaymentCommissionSummary;
    wholesale?: { revenue?: number; invoices_count?: number };
  }>(`/reports/sales-summary?${qs}`);
  const order_count = res.totals?.orders_count ?? 0;
  const total_revenue = res.totals?.total ?? 0;
  return {
    total_revenue,
    order_count,
    average_order_value: order_count > 0 ? total_revenue / order_count : 0,
    period: `${res.from} – ${res.to}`,
    service_charge_total: res.totals?.service_charge_total ?? 0,
    delivery_fee_total: res.totals?.delivery_fee_total ?? 0,
    payments: res.payments,
    payment_commission: res.payment_commission,
    wholesale_revenue: res.wholesale?.revenue ?? 0,
    wholesale_invoices: res.wholesale?.invoices_count ?? 0,
  };
}

export interface SalesBreakdown {
  from: string;
  to: string;
  by_category: { category: string; revenue: number; orders: number }[];
  by_type: { type: string; revenue: number; orders: number }[];
  by_hour: { hour: number; revenue: number; orders: number }[];
  top_items: { id: number; name: string; qty: number; revenue: number }[];
  wholesale_items?: { item_id: number | null; item_name: string; quantity: number; total: number; channel: string }[];
}

export async function getSalesBreakdown(params: { from: string; to: string }): Promise<SalesBreakdown> {
  const qs = new URLSearchParams(params);
  return req(`/reports/sales-breakdown?${qs}`);
}

export interface XReport {
  from: string;
  to: string;
  totals: {
    orders_count: number;
    subtotal: number;
    tax_amount: number;
    discount_amount: number;
    service_charge_total: number;
    total: number;
  };
  payments: Record<string, number>;
  refunds?: number;
  payment_commission?: PaymentCommissionSummary;
  /** FIX 7 — total of tenders that actually moved money (all methods except house_account). */
  collected_laar?: number;
  collected?: number;
  /** FIX 7 — total of house_account tenders (a receivable, not real cash). */
  on_credit_laar?: number;
  on_credit?: number;
  /** FIX 4 — cash-in movements tagged as credit_repayment, for the same window. */
  credit_repayments_cash_laar?: number;
  credit_repayments_cash?: number;
}

export async function getXReport(): Promise<XReport> {
  return req('/reports/x-report');
}

export interface ZReport extends XReport {
  shift_id: number | null;
  closed_at: string | null;
}

export async function getZReport(params?: { from: string; to: string }): Promise<ZReport> {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return req(`/reports/z-report${qs}`);
}

export interface InventoryValuation {
  total_value: number;
  total_quantity: number;
  negative_stock_count: number;
  negative_stock_value: number;
  items: { id: number; name: string; unit: string; quantity: number; cost_per_unit: number; total_value: number }[];
}

export async function getInventoryValuation(): Promise<InventoryValuation> {
  const res = await req<{
    value: number | string;
    quantity: number | string;
    negative_stock_count?: number;
    negative_stock_value?: number | string;
    items?: InventoryValuation['items'];
  }>('/reports/inventory-valuation');
  return {
    total_value: Number(res.value ?? 0),
    total_quantity: Number(res.quantity ?? 0),
    negative_stock_count: Number(res.negative_stock_count ?? 0),
    negative_stock_value: Number(res.negative_stock_value ?? 0),
    items: (res.items ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      quantity: Number(i.quantity ?? 0),
      cost_per_unit: Number(i.cost_per_unit ?? 0),
      total_value: Number(i.total_value ?? 0),
    })),
  };
}

export type SpendByItemRow = {
  inventory_item_id: number;
  item_name: string;
  unit: string | null;
  qty_received: number;
  total_spend: number;
  avg_unit_cost: number;
  last_unit_cost: number;
  last_supplier: string | null;
  cheapest_unit_cost: number | null;
  cheapest_supplier: string | null;
  receipts_count: number;
};

export type SpendByItemReport = {
  from: string;
  to: string;
  totals: { items_count: number; qty_received: number; total_spend: number };
  rows: SpendByItemRow[];
};

export async function getSpendByItem(params: { from: string; to: string }): Promise<SpendByItemReport> {
  const qs = new URLSearchParams({ from: params.from, to: params.to });
  const res = await req<SpendByItemReport>(`/reports/spend-by-item?${qs}`);
  return {
    from: res.from,
    to: res.to,
    totals: {
      items_count: Number(res.totals?.items_count ?? 0),
      qty_received: Number(res.totals?.qty_received ?? 0),
      total_spend: Number(res.totals?.total_spend ?? 0),
    },
    rows: (res.rows ?? []).map((r) => ({
      inventory_item_id: r.inventory_item_id,
      item_name: r.item_name,
      unit: r.unit,
      qty_received: Number(r.qty_received ?? 0),
      total_spend: Number(r.total_spend ?? 0),
      avg_unit_cost: Number(r.avg_unit_cost ?? 0),
      last_unit_cost: Number(r.last_unit_cost ?? 0),
      last_supplier: r.last_supplier,
      cheapest_unit_cost: r.cheapest_unit_cost == null ? null : Number(r.cheapest_unit_cost),
      cheapest_supplier: r.cheapest_supplier,
      receipts_count: Number(r.receipts_count ?? 0),
    })),
  };
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

// ── AP/AR — backend returns a flat invoice list with a per-row supplier/
// customer object. The admin UI was written against an older grouped
// shape (`{ supplier_id, outstanding_amount, invoices: [...] }` per row).
// Group client-side so the page renders without a backend rewrite.

interface BackendAPItem {
  id: number;
  invoice_number: string;
  total: number | string;
  due_date: string | null;
  days_overdue: number;
  status: string;
  supplier: { id: number; name: string; phone: string | null } | null;
  purchase: { id: number; number: string } | null;
}

interface BackendARItem {
  id: number;
  invoice_number: string;
  total: number | string;
  due_date: string | null;
  days_overdue: number;
  status: string;
  customer: { id: number; name: string; phone: string | null } | null;
}

export interface AccountsPayable {
  supplier_id: number;
  supplier_name: string;
  outstanding_amount: number;
  invoices: { id: number; invoice_number: string; amount: number; due_date: string | null }[];
}

export async function getAccountsPayable(): Promise<{ data: AccountsPayable[]; total: number; overdue_count: number }> {
  const res = await req<{
    total_outstanding: number | string;
    overdue_count: number;
    items: BackendAPItem[];
  }>('/reports/finance/accounts-payable');

  const groups = new Map<string, AccountsPayable>();
  for (const inv of res.items ?? []) {
    const sid = inv.supplier?.id ?? 0;
    const sname = inv.supplier?.name ?? 'Unknown supplier';
    const key = `${sid}:${sname}`;
    const amount = Number(inv.total ?? 0);
    if (!groups.has(key)) {
      groups.set(key, { supplier_id: sid, supplier_name: sname, outstanding_amount: 0, invoices: [] });
    }
    const g = groups.get(key)!;
    g.outstanding_amount += amount;
    g.invoices.push({ id: inv.id, invoice_number: inv.invoice_number, amount, due_date: inv.due_date });
  }
  return {
    data: Array.from(groups.values()).sort((a, b) => b.outstanding_amount - a.outstanding_amount),
    total: Number(res.total_outstanding ?? 0),
    overdue_count: res.overdue_count ?? 0,
  };
}

export interface AccountsReceivable {
  customer_id: number | null;
  customer_name: string | null;
  outstanding_amount: number;
  invoices: { id: number; invoice_number: string; amount: number; due_date: string | null }[];
}

export async function getAccountsReceivable(): Promise<{ data: AccountsReceivable[]; total: number; overdue_count: number }> {
  const res = await req<{
    total_outstanding: number | string;
    overdue_count: number;
    items: BackendARItem[];
  }>('/reports/finance/accounts-receivable');

  const groups = new Map<string, AccountsReceivable>();
  for (const inv of res.items ?? []) {
    const cid = inv.customer?.id ?? null;
    const cname = inv.customer?.name ?? null;
    const key = `${cid ?? 'walkin'}:${cname ?? 'Walk-in / Unassigned'}`;
    const amount = Number(inv.total ?? 0);
    if (!groups.has(key)) {
      groups.set(key, { customer_id: cid, customer_name: cname, outstanding_amount: 0, invoices: [] });
    }
    const g = groups.get(key)!;
    g.outstanding_amount += amount;
    g.invoices.push({ id: inv.id, invoice_number: inv.invoice_number, amount, due_date: inv.due_date });
  }
  return {
    data: Array.from(groups.values()).sort((a, b) => b.outstanding_amount - a.outstanding_amount),
    total: Number(res.total_outstanding ?? 0),
    overdue_count: res.overdue_count ?? 0,
  };
}

// ── Purchase Orders ───────────────────────────────────────────────────────────

export interface Purchase {
  id: number;
  purchase_number: string;
  supplier_id: number;
  supplier?: { id: number; name: string; tin?: string | null } | null;
  status: string;
  total: number;
  subtotal?: number;
  purchase_date?: string;
  expected_delivery?: string;
  expected_delivery_date?: string;
  actual_delivery_date?: string | null;
  approved_at?: string | null;
  notes?: string;
  supplier_tin?: string | null;
  supplier_invoice_no?: string | null;
  supplier_invoice_date?: string | null;
  amount_excluding_gst_laar?: number | null;
  gst_rate_bp?: number | null;
  gst_laar?: number | null;
  is_tax_invoice_received?: boolean;
  is_input_tax_claimable?: boolean;
  revenue_or_capital?: 'revenue' | 'capital' | null;
  created_at: string;
  items?: {
    id: number;
    quantity: number;
    received_quantity: number;
    receive_status: string;
    unit_cost: number;
    inventory_item: { id: number; name: string } | null;
  }[];
}

export async function fetchPurchases(params?: { status?: string; page?: number; search?: string }): Promise<{
  purchases: { data: Purchase[]; current_page: number; last_page: number; total: number };
}> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.search) qs.set('search', params.search);
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

export async function updatePurchase(id: number, data: Record<string, unknown>): Promise<{ purchase: Purchase }> {
  return req(`/purchases/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
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
  expected_delivery_date?: string;
  /** Used when expected_delivery_date is omitted; default lead for items without lead_days. */
  default_lead_days?: number;
  notes?: string;
  /** When true, dismisses open reorder alerts for the PO line items. */
  resolve_reorder_alerts?: boolean;
}): Promise<{ purchase: Purchase; resolved_alerts?: number }> {
  return req('/purchases/from-suggest', { method: 'POST', body: JSON.stringify(data) });
}

export async function createPurchase(data: {
  supplier_id: number;
  purchase_date: string;
  notes?: string;
  items: { inventory_item_id: number; name: string; quantity: number; unit_cost: number }[];
}): Promise<{ purchase: Purchase }> {
  return req('/purchases', { method: 'POST', body: JSON.stringify(data) });
}

export type SuggestionItem = {
  inventory_item_id: number;
  name: string;
  unit: string;
  current_stock: number;
  reorder_point: number;
  suggested_quantity: number;
  suggestion_reason?: string;
  daily_usage_rate?: number;
  last_unit_cost: number | null;
  suggested_supplier: { id: number; name: string; price: number; source?: string } | null;
};

export type PurchaseSuggestions = {
  items: SuggestionItem[];
  by_supplier: {
    supplier_id: number | null;
    supplier_name: string;
    items: SuggestionItem[];
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

export type RestockBuyFrequency = {
  purchase_count: number;
  avg_days_between: number | null;
  avg_buy_qty: number;
  last_purchase_date: string | null;
  last_buy_qty: number | null;
};

export type RestockOpenPurchase = {
  id: number;
  purchase_number: string;
  status: string;
  quantity: number;
};

export type RestockOpenAlert = {
  id: number;
  current_stock: number;
  reorder_point: number;
  created_at: string | null;
};

export type RestockPlanItem = {
  id: number;
  name: string;
  unit: string;
  category: string | null;
  current_stock: number;
  reorder_point: number;
  reorder_quantity: number | null;
  daily_usage_rate: number;
  waste_daily_rate?: number;
  waste_daily_rate_clamped?: number;
  waste_pct?: number;
  high_waste?: boolean;
  effective_daily_rate?: number;
  include_waste?: boolean;
  days_of_stock: number | null;
  status: string;
  buy_frequency: RestockBuyFrequency | null;
  suggested_next_order_date: string | null;
  suggested_order_qty: number;
  suggested_reorder_point: number | null;
  reason: string;
  due_soon: boolean;
  /** True when urgency would apply if not snoozed. */
  would_be_due_soon?: boolean;
  snoozed: boolean;
  restock_snoozed_until: string | null;
  /** Permanently hidden from due-soon / draft PO urgency. */
  excluded: boolean;
  /** Effective lead days used for due-soon + suggested ROP. */
  lead_days: number;
  lead_days_source: 'item' | 'default';
  /** Effective cover days used for usage-based order qty. */
  cover_days: number;
  cover_days_source: 'item' | 'default';
  unit_cost: number | null;
  last_purchase_price: number | null;
  /** Percent vs last purchase; null when no baseline. */
  price_change_pct: number | null;
  /** up | down | flat | null */
  price_change: 'up' | 'down' | 'flat' | null;
  suggested_supplier: { id: number; name: string; price: number; source?: string } | null;
  open_purchase: RestockOpenPurchase | null;
  open_alert: RestockOpenAlert | null;
};

export type RestockPlan = {
  lookback_days: number;
  buy_lookback_days: number;
  lead_days: number;
  cover_days: number;
  include_waste?: boolean;
  high_waste_pct?: number;
  totals: {
    items_count: number;
    due_soon: number;
    below_rop: number;
    with_open_po?: number;
    price_up?: number;
    open_alerts?: number;
    snoozed?: number;
    excluded?: number;
  };
  items: RestockPlanItem[];
};

export async function getRestockPlan(params: {
  lookback_days?: number;
  buy_lookback_days?: number;
  lead_days?: number;
  cover_days?: number;
  include_waste?: boolean;
} = {}): Promise<RestockPlan> {
  const q = new URLSearchParams();
  if (params.lookback_days != null) q.set('lookback_days', String(params.lookback_days));
  if (params.buy_lookback_days != null) q.set('buy_lookback_days', String(params.buy_lookback_days));
  if (params.lead_days != null) q.set('lead_days', String(params.lead_days));
  if (params.cover_days != null) q.set('cover_days', String(params.cover_days));
  if (params.include_waste != null) q.set('include_waste', params.include_waste ? '1' : '0');
  const qs = q.toString();
  return req(`/forecasts/restock${qs ? `?${qs}` : ''}`);
}

export type ProcurementReport = {
  from: string;
  to: string;
  spend_by_category: Array<{ category_id: number | null; category: string; amount_laar: number; count: number }>;
  spend_by_supplier: Array<{
    supplier_id: number | null;
    supplier: string;
    expense_laar: number;
    history_spend_mvr: number;
    expense_count: number;
  }>;
  spend_by_buyer: Array<{ buyer_id: number | null; buyer: string; request_count: number; bought_laar: number }>;
  price_trend: Array<{
    inventory_item_id: number;
    item_name: string;
    date: string;
    avg_unit_price: number;
    min_unit_price: number;
    max_unit_price: number;
    samples: number;
  }>;
  savings: {
    total_savings_laar: number;
    quote_picks: number;
    lines: Array<{
      quote_id: number;
      item_id: number;
      item_name: string;
      unit_price_laar: number;
      savings_laar: number;
      actual_qty: number | null;
      selected_at: string;
    }>;
  };
};

export async function getProcurementReport(params: {
  from?: string;
  to?: string;
  inventory_item_id?: number;
} = {}): Promise<ProcurementReport> {
  const q = new URLSearchParams();
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.inventory_item_id != null) q.set('inventory_item_id', String(params.inventory_item_id));
  const qs = q.toString();
  return req(`/reports/procurement${qs ? `?${qs}` : ''}`);
}

export type ApplySuggestedRopResult = {
  updated_count: number;
  skipped_count: number;
  updated: { id: number; name: string; from: number; to: number }[];
  skipped: { id: number; reason: string }[];
};

export async function applySuggestedReorderPoints(data: {
  item_ids: number[];
  lookback_days?: number;
  buy_lookback_days?: number;
  lead_days?: number;
  cover_days?: number;
}): Promise<ApplySuggestedRopResult> {
  return req('/forecasts/restock/apply-rop', { method: 'POST', body: JSON.stringify(data) });
}

export type ApplySuggestedPreferredResult = {
  updated_count: number;
  skipped_count: number;
  updated: { id: number; name: string; supplier_id: number; supplier_name: string }[];
  skipped: { id: number; reason: string }[];
};

export async function applySuggestedPreferredSuppliers(data: {
  item_ids: number[];
  lookback_days?: number;
  buy_lookback_days?: number;
  lead_days?: number;
  cover_days?: number;
}): Promise<ApplySuggestedPreferredResult> {
  return req('/forecasts/restock/apply-preferred', { method: 'POST', body: JSON.stringify(data) });
}

export type GenerateRestockRequestResult = {
  request: {
    id: number;
    request_no: string;
    title: string | null;
    source: string;
    status: string;
    items_count: number;
  } | null;
  preview: Array<{
    inventory_item_id: number;
    name: string;
    requested_qty: number;
    unit: string;
    estimated_unit_cost_laar: number | null;
    reason: string;
  }>;
  skipped: Array<{ id: number; name: string; reason: string }>;
  warning: string | null;
  message?: string;
};

export async function generateRestockPurchaseRequest(data: {
  lookback_days?: number;
  buy_lookback_days?: number;
  lead_days?: number;
  cover_days?: number;
  only_below_rop?: boolean;
} = {}): Promise<GenerateRestockRequestResult> {
  return req('/forecasts/restock/generate-request', { method: 'POST', body: JSON.stringify(data) });
}

export type DeliveryZoneReportRow = {
  zone: string;
  orders_count: number;
  order_total: number;
  fees_total: number;
  avg_fee: number;
};

export type DeliveryZonesReport = {
  from: string;
  to: string;
  zones: DeliveryZoneReportRow[];
  totals: { orders_count: number; order_total: number; fees_total: number };
};

export async function getDeliveryZonesReport(params: { from?: string; to?: string } = {}): Promise<DeliveryZonesReport> {
  const q = new URLSearchParams(params as Record<string, string>);
  return req(`/reports/delivery-zones?${q}`);
}

export type ManagerOverrideRow = {
  id: number;
  action: string;
  user_id: number | null;
  user_name: string;
  model_type: string;
  model_id: number | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

export type ManagerOverridesReport = {
  from: string;
  to: string;
  rows: ManagerOverrideRow[];
};

export type StockVelocityRow = {
  item_id: number;
  item_name: string;
  qty_sold: number;
  velocity: 'fast' | 'slow' | 'normal';
};

export type StockVelocityReport = {
  from: string;
  to: string;
  rows: StockVelocityRow[];
};

export type DriverSettlementRow = {
  driver_id: number;
  driver_name: string;
  orders_count: number;
  completed_count: number;
  order_total: number;
  delivery_fees: number;
  cash_collected: number;
  card_collected: number;
  qr_collected?: number;
  transfer_collected?: number;
  other_collected?: number;
  prepaid_count: number;
};

export type DriverSettlementReport = {
  from: string;
  to: string;
  rows: DriverSettlementRow[];
  totals: { orders_count: number; cash_collected: number; delivery_fees: number };
};

export type ShiftVarianceRow = {
  id: number;
  user_name: string;
  device_name: string;
  opened_at: string;
  closed_at: string;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  variance: number | null;
  notes: string | null;
};

export type ShiftVariancesReport = {
  from: string;
  to: string;
  rows: ShiftVarianceRow[];
};

export type CustomerLtvRow = {
  id: number;
  name: string;
  phone: string | null;
  order_count: number;
  total_spent: number;
  last_order: string | null;
};

export type CustomerLtvReport = {
  from?: string;
  to?: string;
  rows: CustomerLtvRow[];
};

export async function getManagerOverridesReport(params: { from?: string; to?: string; limit?: number } = {}): Promise<ManagerOverridesReport> {
  const q = new URLSearchParams(params as Record<string, string>);
  return req(`/reports/manager-overrides?${q}`);
}

export async function getStockVelocityReport(params: { from?: string; to?: string; limit?: number } = {}): Promise<StockVelocityReport> {
  const q = new URLSearchParams(params as Record<string, string>);
  return req(`/reports/stock-velocity?${q}`);
}

export async function getDriverSettlementReport(params: { from?: string; to?: string } = {}): Promise<DriverSettlementReport> {
  const q = new URLSearchParams(params as Record<string, string>);
  return req(`/reports/driver-settlement?${q}`);
}

export async function getShiftVariancesReport(params: { from?: string; to?: string } = {}): Promise<ShiftVariancesReport> {
  const q = new URLSearchParams(params as Record<string, string>);
  return req(`/reports/shift-variances?${q}`);
}

export async function getCustomerLtvReport(params: { from?: string; to?: string; limit?: number } = {}): Promise<CustomerLtvReport> {
  const q = new URLSearchParams(params as Record<string, string>);
  return req(`/reports/customer-ltv?${q}`);
}

export type HourlySalesRow = {
  hour: number;
  label: string;
  count: number;
  revenue: number;
  avg_total: number;
};

export type HourlySalesReport = {
  from: string;
  to: string;
  hours: HourlySalesRow[];
};

export type StationPerformanceRow = {
  menu_group_id: number | null;
  station: string;
  line_count: number;
  qty: number;
  revenue: number;
};

export type StationPerformanceReport = {
  from: string;
  to: string;
  rows: StationPerformanceRow[];
};

export async function getHourlySalesReport(params: { from?: string; to?: string } = {}): Promise<HourlySalesReport> {
  const q = new URLSearchParams(params as Record<string, string>);
  return req(`/reports/hourly-sales?${q}`);
}

export async function getStationPerformanceReport(params: { from?: string; to?: string } = {}): Promise<StationPerformanceReport> {
  const q = new URLSearchParams(params as Record<string, string>);
  return req(`/reports/station-performance?${q}`);
}

export type CashierPerformanceRow = {
  user_id: number | null;
  name: string;
  orders_count: number;
  total: number;
  avg_order: number;
  voids_count: number;
};

export type CashierPerformanceReport = {
  from: string;
  to: string;
  rows: CashierPerformanceRow[];
};

export type ProductMarginRow = {
  item_id: number;
  name: string;
  price: number;
  cost: number | null;
  margin_pct: number | null;
  category: string | null;
};

export type ProductMarginsReport = {
  rows: ProductMarginRow[];
};

export type StockDiscrepancyRow = {
  type: string;
  id: number;
  name: string;
  detail: string;
};

export type StockDiscrepancyReport = {
  rows: StockDiscrepancyRow[];
};

export async function getCashierPerformanceReport(params: { from?: string; to?: string } = {}): Promise<CashierPerformanceReport> {
  const q = new URLSearchParams(params as Record<string, string>);
  return req(`/reports/cashier-performance?${q}`);
}

export async function getProductMarginsReport(params: { limit?: number } = {}): Promise<ProductMarginsReport> {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', String(params.limit));
  return req(`/reports/product-margins?${q}`);
}

export type CustomerCohortRow = {
  cohort_month: string;
  new_customers: number;
  repeat_customers: number;
  repeat_rate: number;
};

export type CustomerCohortsReport = {
  from: string;
  to: string;
  cohorts: CustomerCohortRow[];
};

export async function getCustomerCohortsReport(params: { from?: string; to?: string } = {}): Promise<CustomerCohortsReport> {
  const q = new URLSearchParams(params as Record<string, string>);
  return req(`/reports/customer-cohorts?${q}`);
}

export async function getStockDiscrepancyReport(): Promise<StockDiscrepancyReport> {
  return req('/reports/stock-discrepancy');
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
  purchase_number?: string | null;
}

export async function getSupplierPriceHistory(supplierId: number, itemId: number): Promise<{
  data: PriceHistory[];
  history: PriceHistory[];
}> {
  return req(`/suppliers/${supplierId}/price-history/${itemId}`);
}

// ── Xero Integration ──────────────────────────────────────────────────────────

export interface XeroStatus {
  connected: boolean;
  tenant_name: string | null;
  connected_at: string | null;
  token_expires_at: string | null;
  token_expired: boolean;
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

// ── Promotion Analytics ───────────────────────────────────────────────────────

export interface PromotionReportItem {
  id: number;
  name: string;
  code: string;
  redemptions_count: number;
  total_discount_laar: number;
}

export async function getPromotionReport(params: { from?: string; to?: string } = {}): Promise<{ report: PromotionReportItem[] }> {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
  const qs = q.toString();
  return req(`/reports/promotions${qs ? `?${qs}` : ''}`);
}

// ── Loyalty Analytics ─────────────────────────────────────────────────────────

export interface LoyaltyReport {
  total_outstanding_points: number;
  total_earned_lifetime: number;
  total_accounts: number;
  bronze_count: number;
  silver_count: number;
  gold_count: number;
  platinum_count: number;
}

export async function getLoyaltyReport(params: { from?: string; to?: string } = {}): Promise<{ report: LoyaltyReport }> {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
  const qs = q.toString();
  return req(`/reports/loyalty${qs ? `?${qs}` : ''}`);
}

// ── Discounts / Voids / Refunds / Credit exposure ───────────────────────────

export interface DiscountsByTypeReport {
  from: string;
  to: string;
  rows: { type: string; amount_laar: number; amount: number; orders_count: number }[];
}

export async function getDiscountsByTypeReport(params: { from: string; to: string }): Promise<DiscountsByTypeReport> {
  const qs = new URLSearchParams(params);
  return req(`/reports/discounts-by-type?${qs}`);
}

export interface VoidsByStaffReport {
  from: string;
  to: string;
  rows: { user_id: number | null; name: string; voids_count: number }[];
}

export async function getVoidsByStaffReport(params: { from: string; to: string }): Promise<VoidsByStaffReport> {
  const qs = new URLSearchParams(params);
  return req(`/reports/voids-by-staff?${qs}`);
}

export interface VoidsByReasonReport {
  from: string;
  to: string;
  rows: { reason: string; voids_count: number }[];
}

export async function getVoidsByReasonReport(params: { from: string; to: string }): Promise<VoidsByReasonReport> {
  const qs = new URLSearchParams(params);
  return req(`/reports/voids-by-reason?${qs}`);
}

export interface RefundsByReasonReport {
  from: string;
  to: string;
  rows: { reason: string; refunds_count: number; amount: number }[];
}

export async function getRefundsByReasonReport(params: { from: string; to: string }): Promise<RefundsByReasonReport> {
  const qs = new URLSearchParams(params);
  return req(`/reports/refunds-by-reason?${qs}`);
}

export interface CreditExposureReport {
  total_balance_laar: number;
  total_balance: number;
  customers_count: number;
  top_customers: {
    id: number;
    name: string;
    balance_laar: number;
    balance: number;
    limit_laar: number;
    limit: number;
    available_laar: number;
    available: number;
    status: string;
    credit_enabled: boolean;
    overdue_invoices_count: number;
  }[];
}

export async function getCreditExposureReport(): Promise<CreditExposureReport> {
  return req('/reports/credit-exposure');
}

export interface DepositExposureReport {
  total_balance_laar: number;
  total_balance: number;
  customers_count: number;
  top_customers: { id: number; name: string; balance_laar: number; balance: number; status: string }[];
}

export async function getDepositExposureReport(): Promise<DepositExposureReport> {
  return req('/reports/deposit-exposure');
}

export interface DepositActivityReport {
  from: string;
  to: string;
  received_laar: number;
  received: number;
  used_laar: number;
  used: number;
  payouts_laar: number;
  payouts: number;
  transfers_laar: number;
  transfers: number;
}

export async function getDepositActivityReport(params: { from: string; to: string }): Promise<DepositActivityReport> {
  const qs = new URLSearchParams({ from: params.from, to: params.to });
  return req(`/reports/deposit-activity?${qs}`);
}

// ── System Health ─────────────────────────────────────────────────────────────

/** Component probe from GET /admin/system/health (object shape). */
export type SystemHealthComponent = {
  ok: boolean;
  status: string;
  error?: string | null;
  driver?: string;
  disk?: string;
  failed_jobs_count?: number | null;
  last_run_at?: string | null;
  latency_ms?: number | null;
};

export interface SystemHealth {
  status: string;
  environment: string;
  app_url?: string;
  host?: string;
  staging_host?: boolean;
  env_mismatch?: boolean;
  /** Legacy string or current `{ ok, status }` probe object. */
  database: string | SystemHealthComponent;
  redis?: SystemHealthComponent;
  queue?: SystemHealthComponent;
  scheduler?: SystemHealthComponent;
  storage?: SystemHealthComponent;
  timestamp: string;
}

/** Safe label for dashboard tiles — never return a raw object (React #31). */
export function systemHealthComponentLabel(value: unknown): string {
  if (typeof value === 'string' && value.trim() !== '') return value;
  if (value && typeof value === 'object' && 'status' in value) {
    const status = (value as { status?: unknown }).status;
    if (typeof status === 'string' && status.trim() !== '') return status;
  }
  return '—';
}

export async function getSystemHealth(): Promise<SystemHealth> {
  return req('/admin/system/health');
}

// ── Server-side CSV export URLs (returns URL to navigate to, token-signed) ───

export function getReportCsvUrl(type: 'sales-summary' | 'sales-breakdown' | 'x-report' | 'z-report' | 'inventory-valuation', params?: { from?: string; to?: string }): string {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  // Same-origin session cookie authenticates the download (no query token).
  return `${BASE}/reports/${type}/csv?${qs}`;
}

// ── Purchase Import & Receipt Upload ─────────────────────────────────────────

export async function importPurchaseCsv(data: {
  file: File;
  supplier_id?: number;
  purchase_date?: string;
  notes?: string;
}): Promise<{ purchase: { id: number; status: string } }> {
  const form = new FormData();
  form.append('file', data.file);
  if (data.supplier_id) form.append('supplier_id', String(data.supplier_id));
  if (data.purchase_date) form.append('purchase_date', data.purchase_date);
  if (data.notes) form.append('notes', data.notes);
  return req('/purchases/import', { method: 'POST', body: form });
}

export async function uploadPurchaseReceipt(purchaseId: number, file: File): Promise<{ receipt: { id: number; file_name: string } }> {
  const form = new FormData();
  form.append('receipt', file);
  return req(`/purchases/${purchaseId}/receipts`, { method: 'POST', body: form });
}

// ── Barcode Label ─────────────────────────────────────────────────────────────

export interface BarcodeLabel {
  item_id: number;
  name: string;
  barcode: string | null;
  sku: string | null;
  price: number;
  generated_at: string;
}

export async function getBarcodeLabel(itemId: number): Promise<{ label: BarcodeLabel }> {
  return req(`/items/${itemId}/barcode-label`);
}
