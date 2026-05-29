import { req } from './client';

export type CustomerGrowthMetrics = {
  total_customers: number;
  new_customers_today: number;
  new_customers_7d: number;
  new_customers_30d: number;
  active_customers_30d: number;
  active_customers_90d: number;
  customers_with_paid_orders: number;
  returning_customers: number;
  repeat_rate: number;
  total_paid_orders: number;
  total_paid_revenue: number;
  average_order_value: number;
  average_lifetime_value: number;
  dormant_30d: number;
  dormant_60d: number;
  dormant_90d: number;
  sms_opt_in_count: number;
  sms_opt_out_count: number;
  incomplete_profile_count: number;
  approved_credit_customers: number;
  total_credit_balance: number;
  overdue_credit_customers: number;
  trends: Array<{
    week: string;
    new_customers: number;
    returning_order_customers: number;
    repeat_rate: number;
  }>;
};

export type CustomerSegmentMeta = {
  slug: string;
  label: string;
  count: number;
};

export type CustomerSegmentRow = {
  id: number;
  name: string | null;
  phone: string;
  email: string | null;
  orders_count_paid: number;
  total_paid_spend: number;
  average_order_value: number;
  last_order_at: string | null;
  loyalty_points: number;
  tier: string;
  sms_opt_out: boolean;
  credit_status: string;
  credit_balance: number;
  tags: Array<{ id: number; name: string; color: string | null }>;
  badges?: string[];
};

export type CustomerGrowthSummary = {
  profile: Record<string, unknown>;
  lifetime: {
    paid_orders_count: number;
    total_paid_spend: number;
    average_order_value: number;
    first_order_at: string | null;
    last_order_at: string | null;
    days_since_last_order: number | null;
  };
  favourite_items: Array<{ item_id: number; name: string; quantity: number }>;
  most_used_order_type: string | null;
  loyalty: Record<string, unknown>;
  credit: Record<string, unknown> | null;
  referral: { codes_count: number; redemptions_as_referee: number };
  reviews: { count: number; average_rating: number };
  sms: { opt_out: boolean; messages_sent: number; last_sent_at: string | null };
  tags: Array<{ id: number; name: string; color: string | null }>;
  follow_up_notes: Array<{
    id: number;
    note: string;
    follow_up_at: string | null;
    completed_at: string | null;
    staff: string | null;
    created_at: string;
  }>;
  badges: string[];
};

export type CustomerActivityEvent = {
  type: string;
  title: string;
  description: string;
  amount?: number | null;
  staff?: string | null;
  created_at: string;
  source_id?: number | null;
};

export type CustomerDataQualityReport = {
  duplicate_phones: { count: number; rows: Array<Record<string, unknown>> };
  missing_names: { count: number; rows: Array<Record<string, unknown>> };
  invalid_phones: { count: number; rows: Array<Record<string, unknown>> };
  no_order_yet: { count: number; rows: Array<Record<string, unknown>> };
  cancelled_only: { count: number; rows: Array<Record<string, unknown>> };
  merge_suggestions: { count: number; rows: Array<Record<string, unknown>> };
};

export async function fetchCustomerGrowthMetrics(): Promise<{ metrics: CustomerGrowthMetrics }> {
  return req('/admin/customers/metrics');
}

export async function fetchCustomerSegments(): Promise<{ segments: CustomerSegmentMeta[] }> {
  return req('/admin/customers/segments');
}

export async function fetchCustomerSegment(
  slug: string,
  params?: { search?: string; page?: number },
): Promise<{ segment: string; data: CustomerSegmentRow[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.page) qs.set('page', String(params.page));
  return req(`/admin/customers/segments/${encodeURIComponent(slug)}?${qs}`);
}

export async function fetchCustomerDataQuality(): Promise<{ report: CustomerDataQualityReport }> {
  return req('/admin/customers/data-quality');
}

export async function fetchCustomerGrowthSummary(
  customerId: number,
): Promise<{ summary: CustomerGrowthSummary }> {
  return req(`/admin/customers/${customerId}/growth-summary`);
}

export async function fetchCustomerActivity(
  customerId: number,
): Promise<{ timeline: CustomerActivityEvent[] }> {
  return req(`/admin/customers/${customerId}/activity`);
}

export async function attachCustomerTag(
  customerId: number,
  data: { tag_id?: number; name?: string; color?: string },
): Promise<{ tags: Array<{ id: number; name: string; color: string | null }> }> {
  return req(`/admin/customers/${customerId}/tags`, { method: 'POST', body: JSON.stringify(data) });
}

export async function detachCustomerTag(customerId: number, tagId: number): Promise<void> {
  await req(`/admin/customers/${customerId}/tags/${tagId}`, { method: 'DELETE' });
}

export async function addCustomerFollowUpNote(
  customerId: number,
  data: { note: string; follow_up_at?: string | null },
): Promise<void> {
  await req(`/admin/customers/${customerId}/follow-up-note`, { method: 'POST', body: JSON.stringify(data) });
}

export async function sendCustomerSms(
  customerId: number,
  message: string,
): Promise<{ message: string }> {
  return req(`/admin/customers/${customerId}/send-sms`, { method: 'POST', body: JSON.stringify({ message }) });
}

export type CorporateInquiry = {
  id: number;
  company: string | null;
  contact_name: string;
  phone: string;
  email: string | null;
  event_date: string | null;
  headcount: number | null;
  notes: string | null;
  status: string;
  created_at: string;
};

export async function fetchCorporateInquiries(params?: { page?: number }): Promise<{
  data: CorporateInquiry[];
  meta: { current_page: number; last_page: number; total: number };
}> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  const suffix = qs.toString() ? `?${qs}` : '';
  return req(`/admin/customers/corporate-inquiries${suffix}`);
}
