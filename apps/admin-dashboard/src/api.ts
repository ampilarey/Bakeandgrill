import { createApiClient } from '@shared/api';
import type { StaffUser, Order as SharedOrder, OrderItem as SharedOrderItem } from '@shared/types';

// Re-export shared types consumed by admin pages
export type { StaffUser, SharedOrder, SharedOrderItem };

const BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.PROD ? '/api' : 'http://localhost:8000/api');

if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  // eslint-disable-next-line no-console
  console.warn('[CONFIG] VITE_API_BASE_URL is not set — falling back to same-origin /api');
}

const { request: req } = createApiClient({
  baseUrl: BASE,
  getToken: () => localStorage.getItem('admin_token'),
});

/**
 * Generic authenticated request helper for ad-hoc admin API calls.
 * Uses the same token and base URL as all other admin requests.
 */
export async function adminRequest<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  return req(path, options);
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function pinLogin(pin: string): Promise<{ token: string; user: StaffUser }> {
  return req('/auth/staff/pin-login', { method: 'POST', body: JSON.stringify({ pin }) });
}

export async function getMe(): Promise<{ user: StaffUser }> {
  return req('/auth/me');
}

export async function logout(): Promise<void> {
  await req('/auth/logout', { method: 'POST' });
}

// ── Orders ───────────────────────────────────────────────────────────────────

export type OrderItem = {
  id: number;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
};

export type Order = {
  id: number;
  order_number: string;
  status: string;
  type: string;
  total: number;
  subtotal?: number;
  table_number?: string | null;
  // Nested customer object returned by the staff list endpoint
  customer?: { id: number; name: string; phone: string } | null;
  // Flat fields (may be present in other endpoints)
  customer_name?: string | null;
  customer_phone?: string | null;
  notes?: string | null;
  paid_at?: string | null;
  created_at: string;
  items?: OrderItem[];
  delivery_address_line1?: string | null;
  delivery_island?: string | null;
  delivery_contact_name?: string | null;
  delivery_contact_phone?: string | null;
  delivery_driver_id?: number | null;
  driver?: { id: number; name: string; phone?: string | null } | null;
  driver_assigned_at?: string | null;
};

export type OrdersResponse = {
  data: Order[];
  meta?: { current_page: number; last_page: number; total: number };
};

export async function fetchOrders(params?: {
  status?: string;
  type?: string;
  page?: number;
  per_page?: number;
  date?: string;
}): Promise<OrdersResponse> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.type) qs.set('type', params.type);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.per_page) qs.set('per_page', String(params.per_page));
  if (params?.date) qs.set('date', params.date);
  return req(`/orders?${qs}`);
}

export async function fetchOrder(id: number, signal?: AbortSignal): Promise<{ order: Order }> {
  return req(`/orders/${id}`, { signal });
}

// ── KDS ──────────────────────────────────────────────────────────────────────

export type KdsTicket = {
  id: number;
  order_number: string;
  status: string;
  type: string;
  items: Array<{
    item_name: string;
    quantity: number;
    modifiers?: Array<{ modifier_name: string }>;
  }>;
  started_at?: string | null;
  created_at: string;
  table_number?: string | null;
  delivery_island?: string | null;
};

export async function fetchKdsOrders(): Promise<{ orders: KdsTicket[] }> {
  // Include paid orders so online orders appear in kitchen
  return req('/kds/orders?status=pending,in_progress,paid');
}

export async function kdsStart(id: number): Promise<void> {
  await req(`/kds/orders/${id}/start`, { method: 'POST' });
}

export async function kdsBump(id: number): Promise<void> {
  await req(`/kds/orders/${id}/bump`, { method: 'POST' });
}

export async function kdsRecall(id: number): Promise<void> {
  await req(`/kds/orders/${id}/recall`, { method: 'POST' });
}

// ── Promotions ───────────────────────────────────────────────────────────────

export type Promotion = {
  id: number;
  name: string;
  code: string;
  type: string;          // 'fixed' | 'percentage' | 'free_item'
  discount_value: number; // laari for fixed, integer % for percentage
  scope: string;
  min_order_laar?: number | null;
  max_uses?: number | null;
  redemptions_count: number;
  stackable: boolean;
  is_active: boolean;
  starts_at?: string | null;
  expires_at?: string | null;
  created_at: string;
};

export async function fetchPromotions(): Promise<{ data: Promotion[] }> {
  return req('/admin/promotions');
}

export type PromotionPayload = {
  name: string;
  code: string;
  type: 'fixed' | 'percentage';
  discount_value: number;  // laari for fixed, integer % for percentage
  scope?: string;
  min_order_laar?: number | null;
  max_uses?: number | null;
  stackable?: boolean;
  is_active?: boolean;
  starts_at?: string | null;
  expires_at?: string | null;
};

export async function createPromotion(data: PromotionPayload): Promise<{ promotion: Promotion }> {
  return req('/admin/promotions', { method: 'POST', body: JSON.stringify(data) });
}

export async function updatePromotion(
  id: number,
  data: Partial<PromotionPayload> & { is_active?: boolean }
): Promise<{ promotion: Promotion }> {
  return req(`/admin/promotions/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deletePromotion(id: number): Promise<void> {
  await req(`/admin/promotions/${id}`, { method: 'DELETE' });
}

// ── Loyalty ──────────────────────────────────────────────────────────────────

export type LoyaltyAccountAdmin = {
  id: number;
  customer_id: number;
  customer_name?: string | null;
  customer_phone: string;
  points_balance: number;
  points_held: number;
  lifetime_points: number;
  tier: string;
  updated_at: string;
};

export async function fetchLoyaltyAccounts(params?: {
  page?: number;
  search?: string;
}): Promise<{ data: LoyaltyAccountAdmin[]; meta?: { total: number } }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.search) qs.set('search', params.search);
  return req(`/admin/loyalty/accounts?${qs}`);
}

export async function adjustLoyaltyPoints(
  customerId: number,
  delta: number,
  reason: string
): Promise<void> {
  await req(`/admin/loyalty/accounts/${customerId}/adjust`, {
    method: 'POST',
    body: JSON.stringify({ delta, reason }),
  });
}

export async function fetchLoyaltyLedger(
  customerId: number
): Promise<{ data: Array<{ id: number; delta: number; reason: string; created_at: string }> }> {
  return req(`/admin/loyalty/accounts/${customerId}/ledger`);
}

// ── SMS ──────────────────────────────────────────────────────────────────────

export type SmsLog = {
  id: number;
  to: string;
  message: string;
  type: string;
  status: string;
  encoding: string;
  segments: number;
  cost_estimate_mvr: string;
  error_message?: string | null;
  sent_at?: string | null;
  created_at: string;
};

export type SmsCampaign = {
  id: number;
  name: string;
  message: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  total_cost_mvr: string;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
};

export async function fetchSmsLogs(params?: {
  type?: string;
  status?: string;
  page?: number;
}): Promise<{ data: SmsLog[]; meta?: { total: number } }> {
  const qs = new URLSearchParams();
  if (params?.type) qs.set('type', params.type);
  if (params?.status) qs.set('status', params.status);
  if (params?.page) qs.set('page', String(params.page));
  return req(`/admin/sms/logs?${qs}`);
}

export async function fetchSmsLogStats(): Promise<{
  total: number;
  sent: number;
  failed: number;
  by_type: Record<string, number>;
}> {
  // Backend returns { stats: [{type, status, count, ...}] } — transform it
  const res = await req<{ stats: Array<{ type: string; status: string; count: number }> }>(
    '/admin/sms/logs/stats'
  );
  const stats = res.stats ?? [];
  const total = stats.reduce((s, r) => s + r.count, 0);
  const sent  = stats.filter((r) => r.status === 'sent').reduce((s, r) => s + r.count, 0);
  const failed = stats.filter((r) => r.status === 'failed').reduce((s, r) => s + r.count, 0);
  const by_type: Record<string, number> = {};
  for (const r of stats) {
    by_type[r.type] = (by_type[r.type] ?? 0) + r.count;
  }
  return { total, sent, failed, by_type };
}

export async function fetchSmsCampaigns(): Promise<{ data: SmsCampaign[] }> {
  return req('/admin/sms/campaigns');
}

export async function previewSmsCampaign(data: {
  message: string;
  criteria: Record<string, unknown>;
}): Promise<{ recipient_count: number; sample: string[]; estimated_cost_mvr: string }> {
  return req('/admin/sms/campaigns/preview', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function createSmsCampaign(data: {
  name: string;
  message: string;
  criteria?: Record<string, unknown>;
}): Promise<{ campaign: SmsCampaign }> {
  return req('/admin/sms/campaigns', { method: 'POST', body: JSON.stringify(data) });
}

export async function sendSmsCampaign(id: number): Promise<void> {
  await req(`/admin/sms/campaigns/${id}/send`, { method: 'POST' });
}

export async function cancelSmsCampaign(id: number): Promise<void> {
  await req(`/admin/sms/campaigns/${id}/cancel`, { method: 'POST' });
}

// ── Reports ──────────────────────────────────────────────────────────────────

export type SalesSummary = {
  total_revenue: number;
  order_count: number;
  average_order_value: number;
  period: string;
};

export async function fetchSalesSummary(params?: {
  from?: string;
  to?: string;
}): Promise<SalesSummary> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  // Backend returns { from, to, totals: { orders_count, total, ... }, payments }
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
  };
}

// ── Menu Management ───────────────────────────────────────────────────────────

export type MenuCategory = {
  id: number;
  name: string;
  name_dv?: string | null;
  description?: string | null;
  image_url?: string | null;
  sort_order?: number | null;
  is_active: boolean;
  items?: MenuItem[];
};

export type MenuItem = {
  id: number;
  name: string;
  name_dv?: string | null;
  description?: string | null;
  sku?: string | null;
  image_url?: string | null;
  base_price: number;
  tax_rate?: number | null;
  is_available: boolean;
  is_active: boolean;
  sort_order?: number | null;
  category_id?: number | null;
  category?: { id: number; name: string } | null;
};

export async function fetchAdminCategories(): Promise<{ data: MenuCategory[] }> {
  return req('/categories?admin=1');
}

export async function createCategory(data: {
  name: string;
  name_dv?: string | null;
  description?: string | null;
  image_url?: string | null;
  sort_order?: number | null;
}): Promise<{ category: MenuCategory }> {
  return req('/categories', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateCategory(
  id: number,
  data: Partial<{
    name: string;
    name_dv: string | null;
    description: string | null;
    image_url: string | null;
    sort_order: number | null;
    is_active: boolean;
  }>
): Promise<{ category: MenuCategory }> {
  return req(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteCategory(id: number): Promise<void> {
  await req(`/categories/${id}`, { method: 'DELETE' });
}

export async function fetchAdminItems(params?: {
  category_id?: number;
  search?: string;
  page?: number;
  per_page?: number;
}): Promise<{ data: MenuItem[]; meta?: { total: number; last_page: number; current_page: number } }> {
  const qs = new URLSearchParams({ admin: '1' });
  if (params?.category_id) qs.set('category_id', String(params.category_id));
  if (params?.search) qs.set('search', params.search);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.per_page) qs.set('per_page', String(params.per_page));
  return req(`/items?${qs}`);
}

export type MenuItemPayload = {
  name: string;
  name_dv?: string | null;
  description?: string | null;
  sku?: string | null;
  image_url?: string | null;
  base_price: number;
  tax_rate?: number | null;
  category_id?: number | null;
  sort_order?: number | null;
  is_active?: boolean;
  is_available?: boolean;
};

export async function createItem(data: MenuItemPayload): Promise<{ item: MenuItem }> {
  return req('/items', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateItem(
  id: number,
  data: Partial<MenuItemPayload>
): Promise<{ item: MenuItem }> {
  return req(`/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteItem(id: number): Promise<void> {
  await req(`/items/${id}`, { method: 'DELETE' });
}

export async function toggleItemAvailability(id: number): Promise<{ item: MenuItem }> {
  return req(`/items/${id}/toggle-availability`, { method: 'PATCH' });
}

// ── Staff Management ──────────────────────────────────────────────────────────

export type StaffMember = {
  id: number;
  name: string;
  email: string;
  role: string | null;       // slug: 'owner' | 'manager' | 'staff'
  role_name: string | null;  // display name e.g. 'Admin'
  role_id: number | null;
  is_active: boolean;
  has_pin: boolean;
  last_login_at: string | null;
  created_at: string;
};

export type StaffRole = { id: number; name: string; slug: string };

export async function fetchStaff(): Promise<{ staff: StaffMember[]; roles: StaffRole[] }> {
  return req('/admin/staff');
}

export async function createStaff(data: {
  name: string;
  email: string;
  role_id: number;
  pin: string;
}): Promise<{ staff: StaffMember }> {
  return req('/admin/staff', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateStaff(
  id: number,
  data: { name?: string; email?: string; role_id?: number; is_active?: boolean }
): Promise<{ staff: StaffMember }> {
  return req(`/admin/staff/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function resetStaffPin(id: number, pin: string): Promise<void> {
  await req(`/admin/staff/${id}/pin`, { method: 'POST', body: JSON.stringify({ pin }) });
}

export async function deleteStaff(id: number): Promise<void> {
  await req(`/admin/staff/${id}`, { method: 'DELETE' });
}

// ── Image Upload ──────────────────────────────────────────────────────────────

export async function uploadMenuImage(file: File): Promise<{ url: string }> {
  const token = localStorage.getItem('admin_token');
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`${BASE}/admin/upload-image`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? `Upload failed (${res.status})`);
  }
  return res.json() as Promise<{ url: string }>;
}

// ── Reservations ──────────────────────────────────────────────────────────────

export type AdminReservation = {
  id: number;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  date: string;
  time_slot: string;
  status: 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';
  notes: string | null;
  table: { id: number; name: string } | null;
  created_at: string;
};

export async function getReservations(params: { date?: string; status?: string; page?: number } = {}): Promise<{ data: AdminReservation[]; meta: { total: number; current_page: number; last_page: number } }> {
  const q = new URLSearchParams();
  if (params.date)   q.set('date',     params.date);
  if (params.status) q.set('status',   params.status);
  if (params.page)   q.set('page',     String(params.page));
  return req(`/admin/reservations?${q}`);
}

export async function updateReservationStatus(id: number, status: string): Promise<{ reservation: AdminReservation }> {
  return req(`/admin/reservations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

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

export async function getExpenseSummary(from: string, to: string): Promise<{ total: number; by_category: { category: string; icon: string; total: number; count: number; pct: number }[] }> {
  return req(`/expenses/summary?from=${from}&to=${to}`);
}

// ── Finance Reports ───────────────────────────────────────────────────────────

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

// ── Webhooks ──────────────────────────────────────────────────────────────────

export type WebhookSubscription = {
  id: number;
  name: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  failure_count: number;
  last_triggered_at: string | null;
  disabled_at: string | null;
  created_at: string;
};

export type WebhookLog = {
  id: number;
  url: string;
  event: string;
  response_code: number | null;
  status: 'delivered' | 'failed';
  created_at: string;
};

export async function fetchWebhooks(): Promise<{ subscriptions: WebhookSubscription[] }> {
  return req('/webhooks');
}

export async function createWebhook(data: { name: string; url: string; events: string[] }): Promise<{ subscription: WebhookSubscription }> {
  return req('/webhooks', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateWebhook(id: number, data: Partial<{ name: string; url: string; events: string[]; active: boolean }>): Promise<{ subscription: WebhookSubscription }> {
  return req(`/webhooks/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteWebhook(id: number): Promise<void> {
  await req(`/webhooks/${id}`, { method: 'DELETE' });
}

export async function rotateWebhookSecret(id: number): Promise<{ secret: string }> {
  return req(`/webhooks/${id}/rotate-secret`, { method: 'POST' });
}

export async function fetchWebhookLogs(id: number): Promise<{ data: WebhookLog[]; total: number }> {
  return req(`/webhooks/${id}/logs`);
}

export async function fetchSupportedWebhookEvents(): Promise<{ events: string[] }> {
  return req('/webhooks/events');
}

// ── Analytics (generic passthrough — AnalyticsPage uses this instead of raw fetch) ──
export async function getAnalytics<T>(path: string): Promise<T> {
  return req(path);
}

// ── Purchase Orders ───────────────────────────────────────────────────────────

export async function fetchPurchases(params?: { status?: string }): Promise<{ data: unknown[] }> {
  const qs = params?.status ? `?status=${params.status}` : '';
  return req(`/purchases${qs}`);
}

export async function approvePurchase(id: number): Promise<void> {
  await req(`/purchases/${id}/approve`, { method: 'POST' });
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
  return req('/inventory/low-stock?suggestions=true');
}

// ── Generic request passthrough (for pages that need dynamic paths) ──────────
export async function apiRequest<T>(path: string, opts?: RequestInit): Promise<T> {
  return req(path, opts);
}

// ── Site Settings ─────────────────────────────────────────────────────────────
export interface SiteSettingsGroup {
  [group: string]: { key: string; value: string | null; type: string; label: string; description: string | null }[];
}

export async function getSiteSettings(): Promise<{ settings: SiteSettingsGroup }> {
  return req('/site-settings');
}

export async function updateSiteSettings(settings: Record<string, string | null>): Promise<void> {
  await req('/site-settings', { method: 'PUT', body: JSON.stringify({ settings }) });
}

export async function uploadSiteLogo(key: string, file: File): Promise<{ url: string }> {
  const token = localStorage.getItem('admin_token');
  const form = new FormData();
  form.append('file', file);
  form.append('key', key);
  const res = await fetch(`${BASE}/site-settings/upload`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth_expired'));
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? `Upload failed (${res.status})`);
  }
  return res.json() as Promise<{ url: string }>;
}

// ── Permissions ───────────────────────────────────────────────────────────────
export interface PermissionItem {
  slug: string; name: string; group: string; granted: boolean; source: 'owner' | 'role' | 'override';
}

export async function getAllPermissions(): Promise<{ permissions: Record<string, { id: number; slug: string; name: string }[]> }> {
  return req('/permissions');
}

export async function getUserPermissions(userId: number): Promise<{ user_id: number; name: string; role: string; permissions: PermissionItem[] }> {
  return req(`/users/${userId}/permissions`);
}

export async function updateUserPermissions(userId: number, permissions: Record<string, boolean | null>): Promise<void> {
  await req(`/users/${userId}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions }) });
}

// ── Gift Cards ────────────────────────────────────────────────────────────────
export interface GiftCard {
  id: number;
  code: string;
  initial_balance: number;
  current_balance: number;
  status: 'active' | 'redeemed' | 'expired' | 'cancelled';
  expires_at: string | null;
  issued_to: { id: number; name: string } | null;
  created_at?: string;
}

export async function fetchGiftCards(params?: { page?: number }): Promise<{ data: GiftCard[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  return req(`/admin/gift-cards?${qs}`);
}

export async function issueGiftCard(data: { amount: number; customer_id?: number | null; expires_at?: string | null }): Promise<{ gift_card: GiftCard }> {
  return req('/admin/gift-cards', { method: 'POST', body: JSON.stringify(data) });
}

export async function checkGiftCardBalance(code: string): Promise<{ code: string; current_balance: number; expires_at: string | null }> {
  return req(`/gift-cards/${encodeURIComponent(code)}/balance`);
}

// ── Reviews ───────────────────────────────────────────────────────────────────
export interface Review {
  id: number;
  rating: number;
  comment: string | null;
  type: string;
  status: 'pending' | 'approved' | 'rejected';
  is_anonymous: boolean;
  author: string;
  item: { id: number; name: string } | null;
  order: { id: number; order_number: string } | null;
  created_at: string;
}

export async function fetchAdminReviews(params?: { status?: string; page?: number }): Promise<{ data: Review[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.page) qs.set('page', String(params.page));
  return req(`/admin/reviews?${qs}`);
}

export async function moderateReview(id: number, status: 'approved' | 'rejected'): Promise<{ review: Review }> {
  return req(`/admin/reviews/${id}/moderate`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

// ── Daily Specials ────────────────────────────────────────────────────────────
export interface DailySpecial {
  id: number;
  item_id: number;
  item_name: string | null;
  item_image: string | null;
  badge_label: string;
  special_price: number | null;
  discount_pct: number | null;
  effective_price: number | null;
  original_price: number | null;
  description: string | null;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  days_of_week: number[] | null;
  is_active: boolean;
  sold_count: number;
  max_quantity: number | null;
}

export async function fetchSpecials(params?: { page?: number }): Promise<{ data: DailySpecial[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  return req(`/admin/specials?${qs}`);
}

export async function createSpecial(data: Partial<DailySpecial>): Promise<{ special: DailySpecial }> {
  return req('/admin/specials', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateSpecial(id: number, data: Partial<DailySpecial>): Promise<{ special: DailySpecial }> {
  return req(`/admin/specials/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteSpecial(id: number): Promise<void> {
  await req(`/admin/specials/${id}`, { method: 'DELETE' });
}

// ── Waste Logs ────────────────────────────────────────────────────────────────
export interface WasteLog {
  id: number;
  item: { id: number; name: string } | null;
  inventory_item: { id: number; name: string } | null;
  quantity: number;
  unit: string | null;
  cost_estimate: number | null;
  reason: string;
  notes: string | null;
  logged_by: string | null;
  created_at: string;
}

export async function fetchWasteLogs(params?: { from?: string; to?: string; page?: number }): Promise<{ data: WasteLog[]; meta: { current_page: number; last_page: number; total: number }; total_cost: number }> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  if (params?.page) qs.set('page', String(params.page));
  return req(`/waste-logs?${qs}`);
}

export async function createWasteLog(data: { item_id?: number; inventory_item_id?: number; quantity: number; unit?: string; cost_estimate?: number; reason: string; notes?: string }): Promise<{ waste_log: WasteLog }> {
  return req('/waste-logs', { method: 'POST', body: JSON.stringify(data) });
}

// ── Refunds ───────────────────────────────────────────────────────────────────
export interface AdminRefund {
  id: number;
  order_id: number;
  order?: { id: number; order_number: string };
  amount: number;
  reason: string | null;
  status: string;
  processed_at: string | null;
  created_at: string;
  user?: { name: string };
}

export async function fetchAdminRefunds(params?: { page?: number; status?: string }): Promise<{ refunds: { data: AdminRefund[]; current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.status) qs.set('status', params.status);
  return req(`/refunds?${qs}`);
}

export async function issueRefund(orderId: number, data: { amount: number; reason?: string }): Promise<{ refund: AdminRefund }> {
  return req(`/orders/${orderId}/refunds`, { method: 'POST', body: JSON.stringify(data) });
}

// ── Customers ─────────────────────────────────────────────────────────────────

export interface AdminCustomer {
  id: number;
  name: string | null;
  phone: string;
  email: string | null;
  tier: string | null;
  loyalty_points: number;
  is_active: boolean;
  is_profile_complete: boolean;
  sms_opt_out: boolean;
  internal_notes: string | null;
  preferred_language: string | null;
  orders_count: number;
  last_login_at: string | null;
  last_order_at: string | null;
  created_at: string;
}

export async function fetchAdminCustomers(params?: {
  search?: string;
  is_active?: boolean;
  page?: number;
}): Promise<{ data: AdminCustomer[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.search)                        qs.set('search', params.search);
  if (params?.is_active !== undefined)       qs.set('is_active', String(params.is_active));
  if (params?.page)                          qs.set('page', String(params.page));
  return req(`/admin/customers?${qs}`);
}

export async function getAdminCustomer(id: number): Promise<{ customer: AdminCustomer; orders: Order[] }> {
  return req(`/admin/customers/${id}`);
}

export async function updateAdminCustomer(
  id: number,
  data: Partial<Pick<AdminCustomer, 'name' | 'email' | 'internal_notes' | 'is_active' | 'sms_opt_out'>>,
): Promise<{ customer: AdminCustomer }> {
  return req(`/admin/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteAdminCustomer(id: number): Promise<void> {
  await req(`/admin/customers/${id}`, { method: 'DELETE' });
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export interface InventoryItem {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  quantity_on_hand: number;
  reorder_level: number | null;
  cost_per_unit: number | null;
  category: { id: number; name: string } | null;
  is_active: boolean;
  last_counted_at: string | null;
  created_at: string;
}

export interface InventoryCategory {
  id: number;
  name: string;
  slug: string | null;
  created_at: string;
}

export async function fetchInventoryItems(params?: {
  search?: string; category_id?: number; low_stock?: boolean; page?: number;
}): Promise<{ data: InventoryItem[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.search)      qs.set('search',      params.search);
  if (params?.category_id) qs.set('category_id', String(params.category_id));
  if (params?.low_stock)   qs.set('low_stock',   '1');
  if (params?.page)        qs.set('page',        String(params.page));
  return req(`/inventory?${qs}`);
}

export async function fetchLowStockItems(): Promise<{ data: InventoryItem[] }> {
  return req('/inventory/low-stock');
}

export async function adjustInventoryStock(
  id: number,
  data: { type: 'add' | 'remove' | 'set'; quantity: number; reason?: string },
): Promise<{ item: InventoryItem }> {
  return req(`/inventory/${id}/adjust`, { method: 'POST', body: JSON.stringify(data) });
}

export async function fetchInventoryCategories(): Promise<{ data: InventoryCategory[] }> {
  return req('/inventory-categories');
}

export async function createInventoryCategory(data: { name: string }): Promise<{ category: InventoryCategory }> {
  return req('/inventory-categories', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateInventoryCategory(id: number, data: { name: string }): Promise<{ category: InventoryCategory }> {
  return req(`/inventory-categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

// ── Tables ────────────────────────────────────────────────────────────────────

export interface RestaurantTable {
  id: number;
  number: string;
  capacity: number;
  zone: string | null;
  status: 'available' | 'occupied' | 'reserved' | 'closed';
  current_order_id: number | null;
  is_active: boolean;
}

export async function fetchTables(): Promise<{ data: RestaurantTable[] }> {
  return req('/tables');
}

export async function createTable(data: { number: string; capacity: number; zone?: string }): Promise<{ table: RestaurantTable }> {
  return req('/tables', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateTable(id: number, data: Partial<{ number: string; capacity: number; zone: string; is_active: boolean }>): Promise<{ table: RestaurantTable }> {
  return req(`/tables/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function openTable(id: number): Promise<{ table: RestaurantTable }> {
  return req(`/tables/${id}/open`, { method: 'POST' });
}

export async function closeTable(id: number): Promise<{ table: RestaurantTable }> {
  return req(`/tables/${id}/close`, { method: 'POST' });
}

export async function mergeTables(tableIds: number[]): Promise<{ table: RestaurantTable }> {
  return req('/tables/merge', { method: 'POST', body: JSON.stringify({ table_ids: tableIds }) });
}

export async function splitTable(id: number, into: number): Promise<{ tables: RestaurantTable[] }> {
  return req(`/tables/${id}/split`, { method: 'POST', body: JSON.stringify({ into }) });
}

// ── Shifts & Cash Drawer ──────────────────────────────────────────────────────

export interface CashMovement {
  id: number;
  type: 'in' | 'out';
  amount: number;
  reason: string;
  created_at: string;
  user?: { name: string };
}

export interface Shift {
  id: number;
  status: 'open' | 'closed';
  opening_cash: number;
  closing_cash: number | null;
  total_cash_in: number;
  total_cash_out: number;
  expected_cash: number | null;
  variance: number | null;
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
  opened_by: string | null;
  closed_by: string | null;
  cash_movements: CashMovement[];
}

export async function getCurrentShift(): Promise<{ shift: Shift | null }> {
  return req('/shifts/current');
}

export async function openShift(data: { opening_cash: number }): Promise<{ shift: Shift }> {
  return req('/shifts/open', { method: 'POST', body: JSON.stringify(data) });
}

export async function closeShift(id: number, data: { closing_cash: number; notes?: string }): Promise<{ shift: Shift }> {
  return req(`/shifts/${id}/close`, { method: 'POST', body: JSON.stringify(data) });
}

export async function addCashMovement(
  shiftId: number,
  data: { type: 'in' | 'out'; amount: number; reason: string },
): Promise<{ movement: CashMovement }> {
  return req(`/shifts/${shiftId}/cash-movements`, { method: 'POST', body: JSON.stringify(data) });
}

// ── Time Clock ────────────────────────────────────────────────────────────────

export interface TimeEntry {
  id: number;
  staff_id: number;
  staff?: { id: number; name: string };
  clocked_in_at: string;
  clocked_out_at: string | null;
  hours_worked: number | null;
  notes: string | null;
}

export async function getTimeClockStatus(): Promise<{ clocked_in: boolean; entry: TimeEntry | null }> {
  return req('/time-clock/status');
}

export async function clockIn(): Promise<{ entry: TimeEntry }> {
  return req('/time-clock/in', { method: 'POST' });
}

export async function clockOut(): Promise<{ entry: TimeEntry }> {
  return req('/time-clock/out', { method: 'POST' });
}

export async function getTimeClockHistory(params?: {
  staff_id?: number; from?: string; to?: string; page?: number;
}): Promise<{ data: TimeEntry[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.staff_id) qs.set('staff_id', String(params.staff_id));
  if (params?.from)     qs.set('from', params.from);
  if (params?.to)       qs.set('to', params.to);
  if (params?.page)     qs.set('page', String(params.page));
  return req(`/time-clock/history?${qs}`);
}

export async function getTimeClockSummary(params: {
  from: string; to: string;
}): Promise<{ data: Array<{ staff: { id: number; name: string }; total_hours: number; entries_count: number }> }> {
  const qs = new URLSearchParams({ from: params.from, to: params.to });
  return req(`/time-clock/summary?${qs}`);
}

// ── Devices ───────────────────────────────────────────────────────────────────

export interface Device {
  id: number;
  name: string;
  type: 'pos' | 'kds' | 'display' | string;
  token: string | null;
  is_active: boolean;
  last_seen_at: string | null;
  registered_by: string | null;
  created_at: string;
}

export async function fetchDevices(): Promise<{ data: Device[] }> {
  return req('/devices');
}

export async function registerDevice(data: { name: string; type: string }): Promise<{ device: Device; token: string }> {
  return req('/devices/register', { method: 'POST', body: JSON.stringify(data) });
}

export async function disableDevice(id: number): Promise<{ device: Device }> {
  return req(`/devices/${id}/disable`, { method: 'PATCH' });
}

export async function enableDevice(id: number): Promise<{ device: Device }> {
  return req(`/devices/${id}/enable`, { method: 'PATCH' });
}

// ── Staff Schedules ───────────────────────────────────────────────────────────

export interface StaffSchedule {
  id: number;
  staff_id: number;
  staff?: { id: number; name: string };
  date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  created_at: string;
}

export async function fetchSchedules(params?: {
  week?: string; staff_id?: number;
}): Promise<{ data: StaffSchedule[] }> {
  const qs = new URLSearchParams();
  if (params?.week)     qs.set('week', params.week);
  if (params?.staff_id) qs.set('staff_id', String(params.staff_id));
  return req(`/admin/schedules?${qs}`);
}

export async function createSchedule(data: {
  staff_id: number; date: string; start_time: string; end_time: string; notes?: string;
}): Promise<{ schedule: StaffSchedule }> {
  return req('/admin/schedules', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateSchedule(
  id: number,
  data: Partial<{ date: string; start_time: string; end_time: string; notes: string }>,
): Promise<{ schedule: StaffSchedule }> {
  return req(`/admin/schedules/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteSchedule(id: number): Promise<void> {
  await req(`/admin/schedules/${id}`, { method: 'DELETE' });
}

// ── Referrals ─────────────────────────────────────────────────────────────────

export interface Referral {
  id: number;
  referrer_id: number;
  referred_id: number | null;
  code: string;
  status: string;
  reward_amount: number | null;
  reward_issued_at: string | null;
  created_at: string;
  referrer?: { id: number; name: string; phone: string };
  referred?: { id: number; name: string; phone: string } | null;
}

export async function fetchAdminReferrals(params?: {
  page?: number; status?: string;
}): Promise<{ data: Referral[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.page)   qs.set('page', String(params.page));
  if (params?.status) qs.set('status', params.status);
  return req(`/admin/referrals${qs.toString() ? '?' + qs : ''}`);
}

export async function validateReferralCode(code: string): Promise<{ valid: boolean; referrer?: { name: string; phone: string }; message?: string }> {
  return req('/referrals/validate', { method: 'POST', body: JSON.stringify({ code }) });
}
