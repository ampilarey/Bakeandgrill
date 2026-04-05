import { req } from './client';

// ── Promotions ────────────────────────────────────────────────────────────────

export type Promotion = {
  id: number;
  name: string;
  code: string;
  type: string;
  discount_value: number;
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

export type PromotionPayload = {
  name: string;
  code: string;
  type: 'fixed' | 'percentage';
  discount_value: number;
  scope?: string;
  min_order_laar?: number | null;
  max_uses?: number | null;
  stackable?: boolean;
  is_active?: boolean;
  starts_at?: string | null;
  expires_at?: string | null;
};

export async function fetchPromotions(): Promise<{ data: Promotion[] }> {
  return req('/admin/promotions');
}

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

export async function fetchSmsCampaigns(): Promise<{ data: SmsCampaign[] }> {
  return req('/admin/sms/campaigns');
}

export async function previewSmsCampaign(data: {
  message: string;
  criteria: Record<string, unknown>;
}): Promise<{ recipient_count: number; sample: string[]; estimated_cost_mvr: string }> {
  return req('/admin/sms/campaigns/preview', { method: 'POST', body: JSON.stringify(data) });
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

export async function fetchSmsPromotions(): Promise<{ data: SmsPromotion[] }> {
  return req('/admin/sms/promotions');
}

export async function createSmsPromotion(data: {
  name: string;
  message: string;
  promotion_code?: string | null;
  trigger_type: string;
  trigger_config?: Record<string, unknown>;
  is_active?: boolean;
}): Promise<{ promotion: SmsPromotion }> {
  return req('/admin/sms/promotions', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateSmsPromotion(id: number, data: Partial<{
  name: string;
  message: string;
  promotion_code: string | null;
  is_active: boolean;
}>): Promise<{ promotion: SmsPromotion }> {
  return req(`/admin/sms/promotions/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function previewSmsPromotion(data: {
  message: string;
  trigger_type: string;
  trigger_config?: Record<string, unknown>;
}): Promise<{ recipient_count: number; sample: string[]; estimated_cost_mvr: string }> {
  return req('/admin/sms/promotions/preview', { method: 'POST', body: JSON.stringify(data) });
}

export async function sendSmsPromotion(id: number): Promise<void> {
  await req(`/admin/sms/promotions/${id}/send`, { method: 'POST' });
}

export async function deleteSmsPromotion(id: number): Promise<void> {
  await req(`/admin/sms/promotions/${id}`, { method: 'DELETE' });
}
