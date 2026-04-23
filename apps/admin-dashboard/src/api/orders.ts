import { req } from './client';

export type OrderItem = {
  id: number;
  item_name: string;
  variant_name?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
};

export type Order = {
  id: number;
  order_number: string;
  status: string;
  type: string;
  total: number;
  subtotal?: number;
  table_number?: string | null;
  // Nested customer object returned by the staff list endpoint
  customer?: { id: number; name: string; phone: string } | null;
  // Flat fields (may be present in other endpoints)
  customer_name?: string | null;
  customer_phone?: string | null;
  notes?: string | null;
  paid_at?: string | null;
  created_at: string;
  items?: OrderItem[];
  delivery_address_line1?: string | null;
  delivery_island?: string | null;
  delivery_contact_name?: string | null;
  delivery_contact_phone?: string | null;
  delivery_driver_id?: number | null;
  driver?: { id: number; name: string; phone?: string | null } | null;
  driver_assigned_at?: string | null;
};

export type OrdersResponse = {
  data: Order[];
  meta?: { current_page: number; last_page: number; total: number };
};

export async function fetchOrders(params?: {
  status?: string;
  type?: string;
  page?: number;
  per_page?: number;
  date?: string;
  search?: string;
}): Promise<OrdersResponse> {
  const qs = new URLSearchParams();
  if (params?.status)   qs.set('status', params.status);
  if (params?.type)     qs.set('type', params.type);
  if (params?.page)     qs.set('page', String(params.page));
  if (params?.per_page) qs.set('per_page', String(params.per_page));
  if (params?.date)     qs.set('date', params.date);
  if (params?.search)   qs.set('search', params.search);
  return req(`/orders?${qs}`);
}

export async function fetchOrder(id: number, signal?: AbortSignal): Promise<{ order: Order }> {
  return req(`/orders/${id}`, { signal });
}

export async function holdOrder(id: number): Promise<{ order: Order }> {
  return req(`/orders/${id}/hold`, { method: 'POST' });
}

export async function resumeOrder(id: number): Promise<{ order: Order }> {
  return req(`/orders/${id}/resume`, { method: 'POST' });
}

export async function addOrderPayments(id: number, data: {
  payments: { method: string; amount: number; reference?: string }[];
}): Promise<{ order: Order }> {
  return req(`/orders/${id}/payments`, { method: 'POST', body: JSON.stringify(data) });
}

export async function sendOrderBill(id: number): Promise<void> {
  await req(`/orders/${id}/send-bill`, { method: 'POST' });
}

// ── KDS ──────────────────────────────────────────────────────────────────────

export type KdsTicket = {
  id: number;
  order_number: string;
  status: string;
  type: string;
  items: Array<{
    item_name: string;
    variant_name?: string | null;
    quantity: number;
    modifiers?: Array<{ modifier_name: string }>;
  }>;
  started_at?: string | null;
  created_at: string;
  table_number?: string | null;
  delivery_island?: string | null;
};

export async function fetchKdsOrders(): Promise<{ orders: KdsTicket[] }> {
  // Include all active kitchen statuses: paid (online orders), pending, preparing, in_progress, ready
  return req('/kds/orders?status=pending,paid,preparing,in_progress,ready');
}

export async function kdsStart(id: number): Promise<void> {
  await req(`/kds/orders/${id}/start`, { method: 'POST' });
}

export async function kdsBump(id: number): Promise<void> {
  await req(`/kds/orders/${id}/bump`, { method: 'POST' });
}

export async function kdsRecall(id: number): Promise<void> {
  await req(`/kds/orders/${id}/recall`, { method: 'POST' });
}

// ── Refunds ───────────────────────────────────────────────────────────────────

export interface AdminRefund {
  id: number;
  order_id: number;
  order?: { id: number; order_number: string };
  amount: number;
  reason: string | null;
  status: string;
  processed_at: string | null;
  created_at: string;
  user?: { name: string };
}

export async function fetchAdminRefunds(params?: { page?: number; status?: string }): Promise<{ refunds: { data: AdminRefund[]; current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.status) qs.set('status', params.status);
  return req(`/refunds?${qs}`);
}

export async function issueRefund(orderId: number, data: { amount: number; reason?: string }): Promise<{ refund: AdminRefund }> {
  return req(`/orders/${orderId}/refunds`, { method: 'POST', body: JSON.stringify(data) });
}

export async function getRefund(id: number): Promise<{ refund: AdminRefund }> {
  return req(`/refunds/${id}`);
}

// ── Delivery drivers ──────────────────────────────────────────────────────────

export interface DeliveryDriver {
  id: number;
  name: string;
  phone?: string | null;
  is_active?: boolean;
}

export async function fetchDeliveryDrivers(): Promise<{ drivers: DeliveryDriver[] }> {
  return req('/delivery/drivers');
}

export async function assignDeliveryDriver(orderId: number, driverId: number): Promise<{ order: Order }> {
  return req(`/delivery/orders/${orderId}/assign-driver`, { method: 'POST', body: JSON.stringify({ driver_id: driverId }) });
}

export async function getReceiptLinkForOrder(orderId: number): Promise<{ link: string }> {
  return req(`/orders/${orderId}/receipt-link`);
}

export async function sendReceiptForOrder(
  orderId: number,
  data?: { recipient?: string; channel?: 'sms' | 'email' },
): Promise<{ receipt: unknown; link: string }> {
  return req(`/receipts/${orderId}/send`, {
    method: 'POST',
    body: JSON.stringify({
      recipient: data?.recipient,
      channel: data?.channel ?? 'sms',
    }),
  });
}
