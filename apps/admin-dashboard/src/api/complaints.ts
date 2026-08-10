import { req } from './client';

export type ComplaintStatus =
  | 'new'
  | 'in_progress'
  | 'awaiting_customer'
  | 'resolved'
  | 'not_actionable';

export type AdminComplaint = {
  id: number;
  reference_number: string;
  category: string;
  status: ComplaintStatus;
  comment?: string | null;
  needs_refund_review: boolean;
  is_food_safety: boolean;
  owner_alert_status: string;
  resolution_note?: string | null;
  created_at: string;
  order?: { id: number; order_number: string; total: number } | null;
  customer?: { id: number; name?: string | null; phone?: string | null } | null;
  cashier?: { id: number; name?: string | null } | null;
  items?: Array<{
    id: number;
    item_name: string;
    quantity: number;
    unit_price_laar: number;
    line_total_laar: number;
  }>;
  status_histories?: Array<{
    id: number;
    from_status: string | null;
    to_status: string;
    internal_note?: string | null;
    resolution_note?: string | null;
    created_at: string;
    changed_by?: { id: number; name?: string | null } | null;
  }>;
  contact_logs?: Array<{
    id: number;
    channel: string;
    note: string;
    created_at: string;
    logged_by?: { id: number; name?: string | null } | null;
  }>;
};

export async function fetchAdminComplaints(params?: {
  page?: number;
  status?: string;
  open?: boolean;
}) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.status) qs.set('status', params.status);
  if (params?.open === false) qs.set('open', '0');
  return req<{
    complaints: {
      data: AdminComplaint[];
      total: number;
      last_page: number;
      current_page: number;
    };
    meta: {
      open_count: number;
      oldest_open_age_minutes: number | null;
      oldest_open_reference: string | null;
    };
  }>(`/complaints?${qs}`);
}

export async function getComplaint(id: number) {
  return req<{ complaint: AdminComplaint }>(`/complaints/${id}`);
}

export async function updateComplaintStatus(
  id: number,
  body: { status: ComplaintStatus; internal_note?: string; resolution_note?: string },
) {
  return req<{ complaint: AdminComplaint }>(`/complaints/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function addComplaintContactLog(
  id: number,
  body: { channel: 'phone' | 'whatsapp' | 'in_person'; note: string },
) {
  return req<{ contact_log: AdminComplaint['contact_logs'] extends (infer T)[] | undefined ? T : never }>(
    `/complaints/${id}/contact-logs`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}
