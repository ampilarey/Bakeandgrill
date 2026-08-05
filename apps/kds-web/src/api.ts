import { createApiClient } from '@shared/api';
import { ENDPOINTS } from '@shared/api';

export type KdsOrderItem = {
  id: number;
  item_id?: number | null;
  parent_order_item_id?: number | null;
  item_name: string;
  variant_name?: string | null;
  quantity: number;
  kitchen_produced_qty?: number | null;
  kitchen_received_qty?: number | null;
  notes?: string | null;
  status?: string;
  menu_group_id?: number | null;
  prep_time_minutes?: number | null;
  is_available?: boolean | null;
  modifiers?: Array<{
    id: number;
    modifier_name: string;
  }>;
};

export type KdsActivityRow = {
  id: number;
  action: string;
  model_type: string;
  model_id: number | null;
  user_name: string;
  meta?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  created_at: string | null;
};

export type KdsOrder = {
  id: number;
  order_number: string;
  status: string;
  type?: string;
  created_at: string;
  delivery_island?: string | null;
  delivery_summary?: string | null;
  table_number?: string | null;
  ticket_name?: string | null;
  notes?: string | null;
  kitchen_done_at?: string | null;
  kitchen_done_by?: { id: number; name: string } | null;
  kitchen_handover_status?: string | null;
  pos_received_at?: string | null;
  items: KdsOrderItem[];
};

export type KdsMenuGroup = {
  id: number;
  name: string;
};

export type KdsStaffUser = {
  id: number;
  name: string;
  role: string;
  role_label?: string;
  permissions: string[];
};

const apiBaseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.PROD ? '/api' : 'http://localhost:8000/api');

if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  // eslint-disable-next-line no-console
  console.warn('[CONFIG] VITE_API_BASE_URL is not set — falling back to same-origin /api');
}

const { request } = createApiClient({
  baseUrl: apiBaseUrl,
  getToken: () => localStorage.getItem('kds_token'),
});

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function staffLogin(
  username: string,
  pin: string,
  deviceIdentifier: string,
): Promise<string> {
  const data = await request<{ token: string }>(ENDPOINTS.STAFF_PIN_LOGIN, {
    method: 'POST',
    body: JSON.stringify({
      username: username.trim(),
      pin,
      device_identifier: deviceIdentifier,
    }),
  });
  return data.token;
}

export async function fetchMe(token: string): Promise<KdsStaffUser> {
  return request<KdsStaffUser>(ENDPOINTS.AUTH_ME, {
    headers: authHeaders(token),
  });
}

export async function fetchKdsOrders(token: string): Promise<KdsOrder[]> {
  const data = await request<{ orders: KdsOrder[] }>(ENDPOINTS.KDS_ORDERS, {
    headers: authHeaders(token),
  });
  return data.orders ?? [];
}

export async function fetchKdsMenuGroups(token: string): Promise<KdsMenuGroup[]> {
  const data = await request<{ data: KdsMenuGroup[] }>('/kds/menu-groups', {
    headers: authHeaders(token),
  });
  return data.data ?? [];
}

export async function startOrder(token: string, orderId: number): Promise<void> {
  await request<void>(ENDPOINTS.KDS_ORDER_START(orderId), {
    method: 'POST',
    headers: authHeaders(token),
  });
}

export async function kitchenDoneOrder(token: string, orderId: number): Promise<void> {
  await request<void>(ENDPOINTS.KDS_ORDER_KITCHEN_DONE(orderId), {
    method: 'POST',
    headers: authHeaders(token),
  });
}

export async function markOrderItemCooked(
  token: string,
  orderId: number,
  orderItemId: number,
  payload?: { qty?: number; notes?: string },
): Promise<void> {
  await request<void>(ENDPOINTS.KDS_ORDER_ITEM_COOKED(orderId, orderItemId), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload ?? {}),
  });
}

export type KitchenProductionBatch = {
  id: number;
  batch_no: string;
  production_type: string;
  status: string;
  order?: { id: number; order_number: string; type?: string } | null;
  items: Array<{
    id: number;
    name: string;
    produced_qty: number;
    unit: string;
    status: string;
  }>;
};

export async function createKitchenProductionBatch(
  token: string,
  payload: Record<string, unknown>,
): Promise<{ batch: KitchenProductionBatch }> {
  return request('/kitchen-production', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function submitKitchenProductionBatch(token: string, batchId: number): Promise<void> {
  await request(`/kitchen-production/${batchId}/submit`, {
    method: 'POST',
    headers: authHeaders(token),
  });
}

export async function printKitchenTicket(token: string, orderId: number): Promise<void> {
  await request<void>(ENDPOINTS.KDS_ORDER_PRINT_TICKET(orderId), {
    method: 'POST',
    headers: authHeaders(token),
  });
}

export async function bumpOrder(token: string, orderId: number): Promise<void> {
  await request<void>(ENDPOINTS.KDS_ORDER_BUMP(orderId), {
    method: 'POST',
    headers: authHeaders(token),
  });
}

export async function recallOrder(token: string, orderId: number): Promise<void> {
  await request<void>(ENDPOINTS.KDS_ORDER_RECALL(orderId), {
    method: 'POST',
    headers: authHeaders(token),
  });
}

export async function markItem86(token: string, itemId: number): Promise<{ is_available: boolean }> {
  const data = await request<{ item: { is_available: boolean } }>(`/kds/items/${itemId}/86`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  return { is_available: !!data.item?.is_available };
}

export async function fetchKdsActivity(token: string): Promise<KdsActivityRow[]> {
  const data = await request<{ activity: KdsActivityRow[] }>('/kds/activity', {
    headers: authHeaders(token),
  });
  return data.activity ?? [];
}

export function hasKdsPermission(permissions: string[], slug: string): boolean {
  return permissions.includes(slug);
}

export type KdsPurchaseRequestItem = {
  id: number;
  name: string;
  requested_qty: number;
  requested_unit: string;
  approved_qty: number | null;
  status: string;
};

export type KdsPurchaseRequest = {
  id: number;
  request_no: string;
  status: string;
  priority: string;
  items: KdsPurchaseRequestItem[];
};

function prHeaders(token: string) {
  return authHeaders(token);
}

export async function createPurchaseRequest(
  token: string,
  payload: {
    source: "kds" | "pos" | "admin";
    priority?: string;
    items: Array<{
      free_text_name?: string;
      category?: string;
      requested_qty: number;
      requested_unit: string;
      reason?: string;
      notes?: string;
    }>;
  },
): Promise<{ request: KdsPurchaseRequest }> {
  return request(`/purchase-requests`, {
    method: 'POST',
    headers: prHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function fetchMyPurchaseRequests(token: string): Promise<{ data: KdsPurchaseRequest[] }> {
  return request('/purchase-requests/my', { headers: prHeaders(token) });
}

export async function fetchAssignedPurchaseRequests(token: string): Promise<{ data: KdsPurchaseRequest[] }> {
  return request('/purchase-requests/assigned-to-me', { headers: prHeaders(token) });
}

export async function markPurchaseRequestItemBought(
  token: string,
  requestId: number,
  itemId: number,
  payload: { actual_qty?: number; buyer_notes?: string },
): Promise<void> {
  await request(`/purchase-requests/${requestId}/items/${itemId}/mark-bought`, {
    method: 'POST',
    headers: prHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function markPurchaseRequestItemPartial(
  token: string,
  requestId: number,
  itemId: number,
  payload: { actual_qty: number },
): Promise<void> {
  await request(`/purchase-requests/${requestId}/items/${itemId}/mark-partial`, {
    method: 'POST',
    headers: prHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function markPurchaseRequestItemNotAvailable(
  token: string,
  requestId: number,
  itemId: number,
  notes?: string,
): Promise<void> {
  await request(`/purchase-requests/${requestId}/items/${itemId}/mark-not-available`, {
    method: 'POST',
    headers: prHeaders(token),
    body: JSON.stringify({ buyer_notes: notes }),
  });
}

export async function uploadPurchaseRequestAttachment(
  token: string,
  requestId: number,
  file: File,
  type: 'request_photo' | 'receipt',
): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  form.append('type', type);
  await request(`/purchase-requests/${requestId}/attachments`, {
    method: 'POST',
    headers: prHeaders(token),
    body: form,
  });
}
