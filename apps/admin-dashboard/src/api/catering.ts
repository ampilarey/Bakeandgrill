import { req } from './client';

export type CateringLine = {
  id?: number;
  item_id?: number | null;
  variant_id?: number | null;
  name: string;
  quantity: number;
  unit_price: number | null;
  notes: string | null;
  is_custom: boolean;
  price_needs_review?: boolean;
  sort_order?: number;
};

export type CateringTaxPreview = {
  subtotal_laar: number;
  tax_laar: number;
  total_laar: number;
  tax_inclusive: boolean;
};

export type CateringAssignee = {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
};

export type CateringRequestRow = {
  id: number;
  customer_id?: number | null;
  reference?: string | null;
  company: string | null;
  occasion: string | null;
  event_type?: string | null;
  contact_name: string;
  phone: string;
  email: string | null;
  event_date: string | null;
  fulfillment_method?: string;
  fulfillment_time?: string | null;
  setup_time?: string | null;
  venue_name?: string | null;
  delivery_address?: string | null;
  delivery_island?: string | null;
  onsite_contact_name?: string | null;
  onsite_contact_phone?: string | null;
  headcount: number | null;
  notes: string | null;
  dietary_notes?: string | null;
  fulfillment_options?: Record<string, boolean> | null;
  interested_items: number[];
  interested_item_names: Array<{ id: number; name: string }>;
  lines_count?: number;
  custom_lines_count?: number;
  lines?: CateringLine[];
  staff_notes: string | null;
  quoted_amount: number | null;
  quote_subtotal_laar?: number | null;
  quote_payment_laar?: number | null;
  quote_is_deposit?: boolean;
  quote_version?: number;
  quote_sent_at?: string | null;
  quote_expires_at?: string | null;
  has_live_quote?: boolean;
  quote_url?: string;
  tax_preview?: CateringTaxPreview;
  assignees?: CateringAssignee[];
  pos_order_id: number | null;
  handled_by: number | null;
  handled_by_name?: string | null;
  contacted_at: string | null;
  quoted_at: string | null;
  confirmed_at: string | null;
  status: string;
  source: string | null;
  created_at: string;
};

export const CATERING_STATUSES = [
  'draft',
  'new',
  'contacted',
  'quoted',
  'awaiting_customer',
  'confirmed',
  'completed',
  'cancelled',
] as const;

export const FULFILLMENT_OPTION_KEYS = [
  { key: 'setup_required', label: 'Setup required' },
  { key: 'food_only', label: 'Food only (no full setup)' },
  { key: 'full_setup', label: 'Full setup' },
  { key: 'disposables', label: 'Disposables' },
  { key: 'serving_equipment', label: 'Serving equipment' },
  { key: 'staff_on_site', label: 'Staff on-site' },
] as const;

export async function fetchCateringRequests(params?: {
  page?: number;
  status?: string;
  q?: string;
  assigned_to_me?: boolean;
}): Promise<{
  data: CateringRequestRow[];
  meta: { current_page: number; last_page: number; total: number };
}> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.status && params.status !== 'all') qs.set('status', params.status);
  if (params?.q?.trim()) qs.set('q', params.q.trim());
  if (params?.assigned_to_me) qs.set('assigned_to_me', '1');
  const suffix = qs.toString() ? `?${qs}` : '';
  return req(`/admin/customers/catering-requests${suffix}`);
}

export async function fetchCateringRequest(id: number): Promise<{ request: CateringRequestRow }> {
  return req(`/admin/customers/catering-requests/${id}`);
}

export async function updateCateringRequest(
  id: number,
  payload: Record<string, unknown>,
): Promise<{ request: CateringRequestRow }> {
  return req(`/admin/customers/catering-requests/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function replaceCateringLines(
  id: number,
  lines: Array<{
    item_id?: number | null;
    variant_id?: number | null;
    custom_name?: string;
    name?: string;
    quantity: number;
    unit_price?: number | null;
    notes?: string | null;
    is_custom?: boolean;
    price_needs_review?: boolean;
  }>,
): Promise<{ request: CateringRequestRow }> {
  return req(`/admin/customers/catering-requests/${id}/lines`, {
    method: 'PUT',
    body: JSON.stringify({ lines }),
  });
}

export async function sendCateringQuote(
  id: number,
  payload: { payment_amount_mvr: number; is_deposit?: boolean },
): Promise<{ request: CateringRequestRow }> {
  return req(`/admin/customers/catering-requests/${id}/send-quote`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function duplicateCateringRequest(id: number): Promise<{ request: CateringRequestRow }> {
  return req(`/admin/customers/catering-requests/${id}/duplicate`, {
    method: 'POST',
  });
}
