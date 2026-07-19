import { req } from './client';

export type CateringRequestRow = {
  id: number;
  company: string | null;
  occasion: string | null;
  contact_name: string;
  phone: string;
  email: string | null;
  event_date: string | null;
  headcount: number | null;
  notes: string | null;
  interested_items: number[];
  interested_item_names: Array<{ id: number; name: string }>;
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
  'new',
  'contacted',
  'quoted',
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
