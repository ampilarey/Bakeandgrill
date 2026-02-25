const BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.PROD ? '/api' : 'http://localhost:8000/api');

type ApiError = { message?: string; errors?: Record<string, string[]> };

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('admin_token');
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ApiError;
    throw new Error(
      body.message ?? Object.values(body.errors ?? {})[0]?.[0] ?? `HTTP ${res.status}`
    );
  }
  return res.json() as Promise<T>;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export type StaffUser = { id: number; name: string; email: string; role: string | null };

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
};

export type OrdersResponse = {
  data: Order[];
  meta?: { current_page: number; last_page: number; total: number };
};

export async function fetchOrders(params?: {
  status?: string;
  type?: string;
  page?: number;
  date?: string;
}): Promise<OrdersResponse> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.type) qs.set('type', params.type);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.date) qs.set('date', params.date);
  return req(`/orders?${qs}`);
}

export async function fetchOrder(id: number): Promise<{ order: Order }> {
  return req(`/orders/${id}`);
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
