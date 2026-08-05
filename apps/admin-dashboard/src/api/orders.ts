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
  tax_amount?: number;
  discount_amount?: number;
  delivery_fee?: number;
  service_charge_amount?: number;
  service_charge_label?: string | null;
  table_number?: string | null;
  /** Independent of `status` — 'unpaid' | 'partial' | 'paid'. Lets the
   *  manager spot phone-call pickup orders that are cooking but still
   *  owe money, without recomputing payments per row. */
  payment_status?: 'unpaid' | 'partial' | 'paid' | null;
  /** Timestamp the kitchen first saw the chit. NULL = ticket still
   *  parked in Open Tickets (Save without Fire). */
  fired_at?: string | null;
  // Nested customer object returned by the staff list endpoint
  customer?: { id: number; name: string; phone: string } | null;
  user?: { id: number; name: string } | null;
  device?: { id: number; name: string; identifier?: string } | null;
  shift?: { id: number; opened_at?: string } | null;
  shift_id?: number | null;
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
  proof_of_delivery_path?: string | null;
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
  /** Surface cooking-but-unpaid orders (phone-call pickup tickets
   *  the customer hasn't paid for yet). Manager view for chasing
   *  outstanding balances at end of day. */
  unpaid_only?: boolean;
  user_id?: number;
  device_id?: number;
}): Promise<OrdersResponse> {
  const qs = new URLSearchParams();
  if (params?.status)      qs.set('status', params.status);
  if (params?.type)        qs.set('type', params.type);
  if (params?.page)        qs.set('page', String(params.page));
  if (params?.per_page)    qs.set('per_page', String(params.per_page));
  if (params?.date)        qs.set('date', params.date);
  if (params?.search)      qs.set('search', params.search);
  if (params?.unpaid_only) qs.set('unpaid_only', '1');
  if (params?.user_id)     qs.set('user_id', String(params.user_id));
  if (params?.device_id)   qs.set('device_id', String(params.device_id));
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

export async function sendOrderBill(
  id: number,
  phone?: string | null,
): Promise<{
  link?: string;
  sms_status?: string | null;
  bill_total?: number;
}> {
  return req(`/orders/${id}/send-bill`, {
    method: 'POST',
    body: JSON.stringify(phone ? { phone } : {}),
  });
}

export async function sendPayLink(
  id: number,
): Promise<{ message: string; amount: number; sent_to: string }> {
  return req(`/orders/${id}/send-pay-link`, { method: 'POST' });
}

export async function cancelOrder(
  id: number,
  reason: string,
): Promise<{ order: Order; unchanged?: boolean }> {
  return req(`/orders/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// ── KDS ──────────────────────────────────────────────────────────────────────

export type KdsTicket = {
  id: number;
  order_number: string;
  status: string;
  type: string;
  items: Array<{
    id?: number;
    item_id?: number | null;
    parent_order_item_id?: number | null;
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
  user?: { id: number; name: string };
}

export async function fetchAdminRefunds(params?: { page?: number; status?: string }): Promise<{
  refunds: { data: AdminRefund[]; current_page: number; last_page: number; total: number };
  meta?: { approved_amount_total?: number };
}> {
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
