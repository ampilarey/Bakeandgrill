import { req, requestBlob } from './client';

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
  type_label?: string;
  category?: string | null;
  customer_name?: string | null;
  campaign_id?: number | null;
  reference_type?: string | null;
  reference_id?: string | null;
};

/**
 * What a campaign audience is built from (SMS audit, 2026-09-24). Every key
 * intersects; "bought" means a paid, unrefunded order. The window (default
 * 90 days) applies to bought items / categories, likes and order types.
 */
export type SmsAudienceCriteria = {
  audience_id?: number | null;
  segment?: string;
  tier?: string[];
  last_order_days?: number;
  opted_in?: boolean;
  has_loyalty?: boolean;
  bought_item_ids?: number[];
  bought_category_ids?: number[];
  not_bought_item_ids?: number[];
  likes_item_id?: number | null;
  order_types?: string[];
  window_days?: number;
  min_spend_mvr?: number;
  min_orders?: number;
  dormant_days?: number;
  birthday_month?: number;
};

export type SmsAudience = {
  id: number;
  name: string;
  description?: string | null;
  criteria: SmsAudienceCriteria;
  summary: string;
  count: number;
  created_by_name?: string | null;
  updated_at?: string | null;
};

export type SmsCampaignRecipe = {
  key: string;
  label: string;
  description: string;
  needs: 'item' | 'category' | null;
  criteria: SmsAudienceCriteria;
  message: string;
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
  target_criteria?: SmsAudienceCriteria | null;
  audience_summary?: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  total_cost_mvr: string;
  scheduled_at?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
};

export type SmsLogFilters = {
  type?: string;
  category?: string;
  status?: string;
  q?: string;
  campaign_id?: number;
  from?: string;
  to?: string;
  page?: number;
  per_page?: number;
};

export type SmsLogTotals = {
  count: number;
  segments: number;
  cost_mvr: number;
  by_status: Record<string, number>;
};

export type SmsLogTypeOption = { key: string; label: string; category: string };

function smsLogQuery(params?: SmsLogFilters): URLSearchParams {
  const qs = new URLSearchParams();
  if (!params) return qs;
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  return qs;
}

/** SMS audit, 2026-09-24: filters on what is really stored, with totals for the filter. */
export async function fetchSmsLogs(params?: SmsLogFilters): Promise<{
  data: SmsLog[];
  total: number;
  current_page: number;
  last_page: number;
  per_page: number;
  totals: SmsLogTotals;
  types: SmsLogTypeOption[];
}> {
  return req(`/admin/sms/logs?${smsLogQuery(params)}`);
}

export async function exportSmsLogs(params?: SmsLogFilters): Promise<Blob> {
  return requestBlob(`/admin/sms/logs/export?${smsLogQuery(params)}`);
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
  target_criteria?: SmsAudienceCriteria;
}): Promise<{
  recipient_count: number;
  audience_summary?: string;
  /** The shared daily bulk cap: how much of it this send would use. */
  daily_cap?: { cap: number; used_24h: number; remaining: number | null; blocked: boolean };
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
  target_criteria?: SmsAudienceCriteria;
  scheduled_at?: string | null;
}): Promise<{ campaign: SmsCampaign }> {
  return req('/admin/sms/campaigns', { method: 'POST', body: JSON.stringify(data) });
}

/** Ready-made audiences + texts, plus the pick-lists the builder needs. */
export async function fetchSmsCampaignRecipes(): Promise<{
  recipes: SmsCampaignRecipe[];
  order_types: Record<string, string>;
  segments: Array<{ slug: string; label: string }>;
}> {
  return req('/admin/sms/campaigns/recipes');
}

/** "Send a test to me": the exact text to the signed-in staff member (or a typed number). */
export async function testSendSmsCampaign(data: { message: string; message_variant_b?: string; phone?: string }): Promise<{
  ok: boolean;
  message: string;
  results: Array<{ variant: string; status: string; to: string; message: string; error?: string | null }>;
}> {
  return req('/admin/sms/campaigns/test-send', { method: 'POST', body: JSON.stringify(data) });
}

export async function fetchSmsAudiences(): Promise<{ audiences: SmsAudience[]; order_types: Record<string, string> }> {
  return req('/admin/sms/audiences');
}

export async function createSmsAudience(data: { name: string; description?: string; criteria: SmsAudienceCriteria }): Promise<{ audience: SmsAudience }> {
  return req('/admin/sms/audiences', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateSmsAudience(id: number, data: { name?: string; description?: string; criteria?: SmsAudienceCriteria }): Promise<{ audience: SmsAudience }> {
  return req(`/admin/sms/audiences/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteSmsAudience(id: number): Promise<void> {
  await req(`/admin/sms/audiences/${id}`, { method: 'DELETE' });
}

export async function sendSmsCampaign(id: number): Promise<void> {
  await req(`/admin/sms/campaigns/${id}/send`, { method: 'POST' });
}

export async function cancelSmsCampaign(id: number): Promise<void> {
  await req(`/admin/sms/campaigns/${id}/cancel`, { method: 'POST' });
}

// ── SMS blasts (history only) ─────────────────────────────────────────────────
// SMS audit, 2026-09-24: sending moved to Campaigns; POST /sms/promotions/*
// answers 410. The list stays so past blasts can still be seen.

export interface SmsPromotion {
  id: number;
  name: string | null;
  message: string;
  status?: string;
  recipient_count?: number;
  recipients_count?: number;
  created_at: string;
}

export async function fetchSmsPromotions(): Promise<{ promotions: { data?: SmsPromotion[] } | SmsPromotion[] }> {
  return req('/sms/promotions');
}

export async function getSmsPromotion(id: number): Promise<{ promotion: SmsPromotion }> {
  return req(`/sms/promotions/${id}`);
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
