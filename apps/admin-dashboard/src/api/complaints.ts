import { req, requestBlob } from './client';

export type ComplaintStatus =
  | 'new'
  | 'in_progress'
  | 'awaiting_customer'
  | 'resolved'
  | 'not_actionable';

export type AdminComplaint = {
  id: number;
  reference_number: string;
  categories: string[];
  status: ComplaintStatus;
  comment?: string | null;
  has_photo?: boolean;
  needs_refund_review: boolean;
  refund_id?: number | null;
  is_food_safety: boolean;
  owner_alert_status: string;
  internal_note?: string | null;
  customer_reply?: string | null;
  created_at: string;
  order?: { id: number; order_number: string; total: number } | null;
  refund?: {
    id: number;
    order_id: number;
    amount: number;
    status: string;
    reason_category?: string | null;
    created_at?: string;
  } | null;
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
    customer_reply?: string | null;
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
  body: { status: ComplaintStatus; internal_note?: string; customer_reply?: string },
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

export async function fetchComplaintPhotoBlob(id: number): Promise<Blob> {
  return requestBlob(`/complaints/${id}/photo`);
}

export async function linkComplaintRefund(id: number, refundId: number) {
  return req<{ complaint: AdminComplaint }>(`/complaints/${id}/link-refund`, {
    method: 'POST',
    body: JSON.stringify({ refund_id: refundId }),
  });
}
