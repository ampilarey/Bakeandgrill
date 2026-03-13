import { createApiClient } from '@shared/api';
import { ENDPOINTS } from '@shared/api';

// KDS-specific order item shape (modifiers use different field names)
export type KdsOrderItem = {
  id: number;
  item_name: string;
  quantity: number;
  modifiers?: Array<{
    id: number;
    modifier_name: string;
    modifier_price: number;
  }>;
};

export type KdsOrder = {
  id: number;
  order_number: string;
  status: string;
  created_at: string;
  items: KdsOrderItem[];
};

const apiBaseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.PROD ? '/api' : 'http://localhost:8000/api');

// Token is stored after login; KDS re-reads it per request
const { request } = createApiClient({
  baseUrl: apiBaseUrl,
  getToken: () => localStorage.getItem('kds_token'),
});

export async function staffLogin(
  pin: string,
  deviceIdentifier: string,
): Promise<string> {
  const data = await request<{ token: string }>(ENDPOINTS.STAFF_PIN_LOGIN, {
    method: 'POST',
    body: JSON.stringify({ pin, device_identifier: deviceIdentifier }),
  });
  return data.token;
}

export async function fetchKdsOrders(token: string): Promise<KdsOrder[]> {
  const data = await request<{ orders: KdsOrder[] }>(ENDPOINTS.KDS_ORDERS, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data.orders ?? [];
}

export async function startOrder(token: string, orderId: number): Promise<void> {
  await request<void>(ENDPOINTS.KDS_ORDER_START(orderId), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function bumpOrder(token: string, orderId: number): Promise<void> {
  await request<void>(ENDPOINTS.KDS_ORDER_BUMP(orderId), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function recallOrder(token: string, orderId: number): Promise<void> {
  await request<void>(ENDPOINTS.KDS_ORDER_RECALL(orderId), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}
