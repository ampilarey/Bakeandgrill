import { req } from './client';

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
  headcount: number | null;
  notes: string | null;
  dietary_notes?: string | null;
  interested_items: number[];
  interested_item_names: Array<{ id: number; name: string }>;
  lines_count?: number;
  custom_lines_count?: number;
  lines?: Array<{
    id: number;
    name: string;
    quantity: number;
    unit_price: number | null;
    is_custom: boolean;
    notes: string | null;
  }>;
  staff_notes: string | null;
  quoted_amount: number | null;
  pos_order_id: number | null;
  handled_by: number | null;
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

export async function fetchCateringRequests(params?: {
  page?: number;
  status?: string;
}): Promise<{
  data: CateringRequestRow[];
  meta: { current_page: number; last_page: number; total: number };
}> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.status && params.status !== 'all') qs.set('status', params.status);
  const suffix = qs.toString() ? `?${qs}` : '';
  return req(`/admin/customers/catering-requests${suffix}`);
}

export async function fetchCateringRequest(id: number): Promise<{ request: CateringRequestRow }> {
  return req(`/admin/customers/catering-requests/${id}`);
}

export async function updateCateringRequest(
  id: number,
  payload: {
    status?: string;
    quoted_amount?: number | null;
    staff_notes?: string | null;
    pos_order_id?: number | null;
  },
): Promise<{ request: CateringRequestRow }> {
  return req(`/admin/customers/catering-requests/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
