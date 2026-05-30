import { createApiClient } from '@shared/api';
import { ENDPOINTS } from '@shared/api';

export type KdsOrderItem = {
  id: number;
  item_id?: number | null;
  item_name: string;
  variant_name?: string | null;
  quantity: number;
  notes?: string | null;
  status?: string;
  menu_group_id?: number | null;
  prep_time_minutes?: number | null;
  modifiers?: Array<{
    id: number;
    modifier_name: string;
  }>;
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

export async function markItem86(token: string, itemId: number): Promise<void> {
  await request<void>(`/kds/items/${itemId}/86`, {
    method: 'POST',
    headers: authHeaders(token),
  });
}

export function hasKdsPermission(permissions: string[], slug: string): boolean {
  return permissions.includes(slug);
}
