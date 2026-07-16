import { req } from './client';

export type PurchaseRequestItem = {
  id: number;
  inventory_item_id: number | null;
  menu_item_id: number | null;
  name: string;
  free_text_name: string | null;
  category: string | null;
  requested_qty: number;
  requested_unit: string;
  approved_qty: number | null;
  actual_qty: number | null;
  actual_unit: string | null;
  status: string;
  reason: string | null;
  notes: string | null;
  buyer_notes: string | null;
  supplier_name_text: string | null;
  bought_at: string | null;
  received_at: string | null;
  estimated_unit_cost_laar?: number | null;
  actual_unit_cost_laar?: number | null;
  actual_total_laar?: number | null;
  supplier_id?: number | null;
  verified_notes?: string | null;
};

export type PurchaseRequest = {
  id: number;
  request_no: string;
  title: string | null;
  source: string;
  status: string;
  priority: string;
  needed_by: string | null;
  notes: string | null;
  rejection_reason: string | null;
  requested_by: number;
  requester: { id: number; name: string } | null;
  assigned_to: number | null;
  assignee: { id: number; name: string } | null;
  purchase_id: number | null;
  purchase?: { id: number; purchase_number: string } | null;
  expense_id: number | null;
  expense?: { id: number; expense_number: string } | null;
  total_estimated_laar?: number | null;
  total_actual_laar?: number | null;
  created_at: string;
  updated_at: string;
  items: PurchaseRequestItem[];
};

export function laarToMvr(laar: number | null | undefined): string {
  if (laar == null) return '—';
  return (laar / 100).toFixed(2);
}

export async function fetchPurchaseRequests(params?: {
  status?: string;
  priority?: string;
  page?: number;
}): Promise<{ data: PurchaseRequest[]; meta: { current_page: number; last_page: number; total: number } }> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.priority) q.set('priority', params.priority);
  if (params?.page) q.set('page', String(params.page));
  const qs = q.toString();
  return req(`/purchase-requests${qs ? `?${qs}` : ''}`);
}

export async function getPurchaseRequest(id: number): Promise<{ request: PurchaseRequest }> {
  return req(`/purchase-requests/${id}`);
}

export async function approvePurchaseRequest(id: number): Promise<{ request: PurchaseRequest }> {
  return req(`/purchase-requests/${id}/approve`, { method: 'POST' });
}

export async function rejectPurchaseRequest(id: number, reason?: string): Promise<{ request: PurchaseRequest }> {
  return req(`/purchase-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
}

export async function assignPurchaseRequest(id: number, assignedTo: number): Promise<{ request: PurchaseRequest }> {
  return req(`/purchase-requests/${id}/assign`, { method: 'POST', body: JSON.stringify({ assigned_to: assignedTo }) });
}

export async function cancelPurchaseRequest(id: number): Promise<{ request: PurchaseRequest }> {
  return req(`/purchase-requests/${id}/cancel`, { method: 'POST' });
}

export async function updatePurchaseRequest(
  id: number,
  data: {
    title?: string;
    priority?: string;
    needed_by?: string;
    notes?: string;
    items?: Array<{ id: number; approved_qty?: number; requested_qty?: number; notes?: string }>;
  },
): Promise<{ request: PurchaseRequest }> {
  return req(`/purchase-requests/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function verifyPurchaseRequestItem(
  requestId: number,
  itemId: number,
  data?: { inventory_item_id?: number; verified_notes?: string },
): Promise<{ item: PurchaseRequestItem; request: PurchaseRequest; warnings?: string[] }> {
  return req(`/purchase-requests/${requestId}/items/${itemId}/verify-received`, {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

export async function verifyAllPurchaseRequestItems(id: number): Promise<{ request: PurchaseRequest }> {
  return req(`/purchase-requests/${id}/verify-all`, { method: 'POST' });
}

export async function convertPurchaseRequestToPurchase(id: number): Promise<{
  purchase: { id: number; purchase_number: string };
  request: PurchaseRequest;
}> {
  return req(`/purchase-requests/${id}/convert-to-purchase`, { method: 'POST' });
}

export async function convertPurchaseRequestToExpense(id: number): Promise<{
  expense: { id: number; expense_number: string };
  request: PurchaseRequest;
}> {
  return req(`/purchase-requests/${id}/convert-to-expense`, { method: 'POST' });
}

export async function mergePurchaseRequests(targetId: number, sourceIds: number[]): Promise<{ request: PurchaseRequest }> {
  return req(`/purchase-requests/${targetId}/merge`, {
    method: 'POST',
    body: JSON.stringify({ source_ids: sourceIds }),
  });
}
