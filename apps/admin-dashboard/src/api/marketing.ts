import { req } from './client';

// ── Promotions ────────────────────────────────────────────────────────────────

export type PromotionTarget = {
  id?: number;
  target_type: 'item' | 'category';
  target_id: number;
  is_exclusion?: boolean;
  /** null/absent = reward (legacy). UI uses "Customer must buy" / "They get". */
  role?: 'trigger' | 'reward' | null;
  metadata?: { min_qty?: number } | null;
};

export type PromotionType =
  | 'fixed'
  | 'percentage'
  | 'free_item'
  | 'tiered'
  | 'quantity_break'
  | 'buy_x_get_y'
  | 'free_delivery';

export type PromotionTier = {
  min_laar: number;
  kind: 'fixed' | 'percentage';
  value: number;
};

export type PromotionMetadata = {
  tiers?: PromotionTier[];
  min_qty?: number;
  kind?: 'fixed' | 'percentage';
  value?: number;
  buy_qty?: number;
  get_qty?: number;
  get_discount_pct?: number;
  cheapest?: boolean;
};

export type Promotion = {
  id: number;
  name: string;
  code: string | null;
  type: string;
  discount_value: number;
  scope: string;
  min_order_laar?: number | null;
  max_uses?: number | null;
  redemptions_count: number;
  budget_laar?: number | null;
  spent_laar?: number;
  stackable: boolean;
  is_active: boolean;
  auto_apply?: boolean;
  first_order_only?: boolean;
  registered_only?: boolean;
  waive_delivery?: boolean;
  metadata?: PromotionMetadata | null;
  starts_at?: string | null;
  expires_at?: string | null;
  days_of_week?: number[] | null;
  starts_time?: string | null;
  ends_time?: string | null;
  restricted_customer_id?: number | null;
  restricted_customer?: { id: number; name: string | null; phone: string } | null;
  targets?: PromotionTarget[];
  created_at: string;
};

export type PromotionPayload = {
  name: string;
  code?: string | null;
  type: PromotionType;
  discount_value: number;
  scope?: string;
  min_order_laar?: number | null;
  max_uses?: number | null;
  stackable?: boolean;
  is_active?: boolean;
  auto_apply?: boolean;
  first_order_only?: boolean;
  registered_only?: boolean;
  waive_delivery?: boolean;
  budget_laar?: number | null;
  metadata?: PromotionMetadata | null;
  starts_at?: string | null;
  expires_at?: string | null;
  days_of_week?: number[] | null;
  starts_time?: string | null;
  ends_time?: string | null;
  restricted_customer_id?: number | null;
  targets?: PromotionTarget[];
};

export async function fetchPromotions(params?: { page?: number; status?: string }): Promise<{ data: Promotion[]; meta?: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.status) qs.set('status', params.status);
  const query = qs.toString() ? `?${qs}` : '';
  return req(`/admin/promotions${query}`);
}

export async function createPromotion(data: PromotionPayload): Promise<{ promotion: Promotion }> {
  // Strip null optional fields so the backend doesn't try to insert non-existent columns
  const payload = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== null && v !== undefined),
  );
  return req('/admin/promotions', { method: 'POST', body: JSON.stringify(payload) });
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

export type OffersPerformanceReport = {
  report: Array<{
    id: number;
    name: string;
    code: string | null;
    auto_apply?: boolean;
    is_active?: boolean;
    type?: string;
    discount_value?: number;
    redemptions_count: number;
    total_discount_laar: number;
    order_promotions_draft?: number;
  }>;
  specials: Array<{
    id: number;
    kind: string;
    name: string;
    is_active: boolean;
    sold_count: number;
    max_quantity?: number | null;
    discount_pct?: number | null;
    special_price?: number | null;
    start_date?: string | null;
    end_date?: string | null;
  }>;
  offers_preview: Array<{
    id: string;
    kind: string;
    title: string;
    badge?: string | null;
    effective_price?: number | null;
    original_price?: number | null;
    ends_at?: string | null;
    link: string;
  }>;
};

export async function fetchOffersPerformance(): Promise<OffersPerformanceReport> {
  return req('/admin/reports/promotions');
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
  ab_test_enabled?: boolean;
  message_variant_b?: string | null;
  ab_split_percent?: number;
  ab_stats?: Record<'a' | 'b', { sent: number; failed: number; pending: number; delivery_rate: number }>;
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
  if (params?.type)   qs.set('type', params.type);
  if (params?.status) qs.set('status', params.status);
  if (params?.page)   qs.set('page', String(params.page));
  return req(`/admin/sms/logs?${qs}`);
}

export async function fetchSmsLogStats(): Promise<{
  total: number;
  sent: number;
  failed: number;
  by_type: Record<string, number>;
}> {
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

export async function fetchSmsCampaigns(params?: { page?: number; status?: string }): Promise<{ data: SmsCampaign[]; meta?: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.status) qs.set('status', params.status);
  const query = qs.toString() ? `?${qs}` : '';
  return req(`/admin/sms/campaigns${query}`);
}

export async function previewSmsCampaign(data: {
  message: string;
  message_variant_b?: string;
  ab_test_enabled?: boolean;
  ab_split_percent?: number;
  target_criteria?: Record<string, unknown>;
}): Promise<{
  recipient_count: number;
  total_cost_mvr: string;
  ab_test_enabled?: boolean;
  ab_split?: { variant_a: number; variant_b: number };
  sample_recipients?: Array<{ name: string; phone: string; tier: string }>;
}> {
  return req('/admin/sms/campaigns/preview', { method: 'POST', body: JSON.stringify(data) });
}

export async function createSmsCampaign(data: {
  name: string;
  message: string;
  message_variant_b?: string;
  ab_test_enabled?: boolean;
  ab_split_percent?: number;
  target_criteria?: Record<string, unknown>;
}): Promise<{ campaign: SmsCampaign }> {
  return req('/admin/sms/campaigns', { method: 'POST', body: JSON.stringify(data) });
}

export async function sendSmsCampaign(id: number): Promise<void> {
  await req(`/admin/sms/campaigns/${id}/send`, { method: 'POST' });
}

export async function cancelSmsCampaign(id: number): Promise<void> {
  await req(`/admin/sms/campaigns/${id}/cancel`, { method: 'POST' });
}

// ── SMS Promotions ────────────────────────────────────────────────────────────

export interface SmsPromotion {
  id: number;
  name: string;
  message: string;
  promotion_code: string | null;
  trigger_type: string;
  trigger_config: Record<string, unknown> | null;
  is_active: boolean;
  total_sent: number;
  total_cost_mvr: string;
  created_at: string;
}

// Backend routes: GET /sms/promotions, GET /sms/promotions/{id},
// POST /sms/promotions/preview, POST /sms/promotions/send
// Note: PATCH/DELETE/per-id-send do not exist on the backend.
export async function fetchSmsPromotions(): Promise<{ promotions: SmsPromotion[] }> {
  return req('/sms/promotions');
}

export async function getSmsPromotion(id: number): Promise<{ promotion: SmsPromotion }> {
  return req(`/sms/promotions/${id}`);
}

export async function previewSmsPromotion(data: {
  message: string;
  filters?: Record<string, unknown>;
}): Promise<{ estimate?: { recipient_count: number; cost_mvr: number; total_cost_mvr: number }; recipient_count?: number }> {
  return req('/sms/promotions/preview', { method: 'POST', body: JSON.stringify(data) });
}

export async function sendSmsPromotion(data: {
  message: string;
  name?: string;
  filters?: Record<string, unknown>;
}): Promise<{ promotion: SmsPromotion }> {
  return req('/sms/promotions/send', { method: 'POST', body: JSON.stringify(data) });
}

// ── Marketing automation (birthday + abandoned cart) ────────────────────────

export type MarketingAutomationSettings = {
  birthday_enabled: boolean;
  birthday_points: number;
  birthday_sms_template: string;
  abandoned_cart_enabled: boolean;
  abandoned_cart_delay_minutes: number;
  abandoned_cart_sms_template: string;
  abandoned_cart_ttl_days: number;
  tier_milestone_enabled: boolean;
  tier_milestone_within: number;
  tier_milestone_sms_template: string;
};

export async function fetchMarketingAutomation(): Promise<{ settings: MarketingAutomationSettings }> {
  return req('/admin/marketing/automation');
}

export async function updateMarketingAutomation(
  data: Partial<MarketingAutomationSettings>,
): Promise<{ settings: MarketingAutomationSettings; message: string }> {
  return req('/admin/marketing/automation', { method: 'PATCH', body: JSON.stringify(data) });
}

// ── Frequently bought together (item affinity) ───────────────────────────────

export type ItemPairRow = {
  item_id: number;
  item_name: string;
  paired_item_id: number;
  paired_item_name: string;
  pair_count: number;
  /** Money the two items themselves took in orders holding both. */
  pair_revenue: number;
  /** Percentage of the anchor's orders that also held the pair. */
  confidence: number;
  /** 1.0 = no relationship beyond the paired item being popular. */
  lift: number;
  anchor_orders: number;
};

export type ItemPairMeta = {
  current_page: number;
  last_page: number;
  total: number;
  sort: 'lift' | 'count';
  min_support: number;
  computed_at: string | null;
};

export async function fetchItemPairs(params?: {
  page?: number;
  per_page?: number;
  sort?: 'lift' | 'count';
}): Promise<{ data: ItemPairRow[]; meta: ItemPairMeta }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.per_page) qs.set('per_page', String(params.per_page));
  if (params?.sort) qs.set('sort', params.sort);
  const query = qs.toString() ? `?${qs}` : '';
  return req(`/admin/marketing/item-pairs${query}`);
}

export type SuggestionPerfRow = {
  item_id: number;
  item_name: string;
  surface: string;
  shown: number;
  accepted: number;
  /** Accepted ÷ shown, as a percentage. */
  take_rate: number;
  revenue: number;
};

export type SuggestionPerfMeta = {
  days: number;
  shown: number;
  accepted: number;
  take_rate: number;
  revenue: number;
};

/**
 * How the suggestion panels performed — the only figures that say whether the
 * "Goes well with" block earns its screen space.
 */
export async function fetchSuggestionPerformance(days = 30): Promise<{
  data: SuggestionPerfRow[];
  meta: SuggestionPerfMeta;
}> {
  return req(`/admin/marketing/suggestion-performance?days=${days}`);
}
