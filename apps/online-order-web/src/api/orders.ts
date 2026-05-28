// ── Orders & Payments ──────────────────────────────────────────────────────────
import { ENDPOINTS } from '@shared/api';
import type { Order, OrderItem, InitiatePaymentResult } from '@shared/types';
import { API_ORIGIN, request } from './client';

export type OrderDetail = Order & {
  items?: OrderItem[];
  payments?: Array<{ method: string; amount: number; status: string }>;
};

export type DeliveryOrderPayload = {
  items: Array<{
    item_id: number;
    quantity: number;
    variant_id?: number;
    modifiers?: Array<{ modifier_id: number }>;
  }>;
  delivery_address_line1: string;
  delivery_address_line2?: string;
  delivery_island: string;
  delivery_contact_name: string;
  delivery_contact_phone: string;
  delivery_notes?: string;
  delivery_location_link?: string;
  save_address?: boolean;
  address_label?: string;
  desired_eta?: string;
  customer_notes?: string;
};

export interface ReorderPayload {
  items: {
    item_id: number;
    quantity: number;
    item_name: string;
    unit_price: number;
    name?: string;
    price?: number;
    modifiers: { id: number; name: string; price: number }[];
  }[];
  original_type?: string;
}

export async function fetchCustomerOrders(token: string, signal?: AbortSignal): Promise<{ data: Order[] }> {
  return request<{ data: Order[] }>(ENDPOINTS.CUSTOMER_ORDERS, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
}

export async function createCustomerOrder(
  token: string,
  payload: {
    items: Array<{ item_id: number; quantity: number; variant_id?: number; modifiers?: Array<{ modifier_id: number; quantity?: number }> }>;
    customer_notes?: string;
    type?: string;
  },
): Promise<{ order: Order }> {
  return request<{ order: Order }>(ENDPOINTS.CUSTOMER_ORDERS, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function createDeliveryOrder(token: string, payload: DeliveryOrderPayload): Promise<{ order: OrderDetail }> {
  return request<{ order: OrderDetail }>(ENDPOINTS.DELIVERY_ORDER, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function getOrderDetail(token: string, orderId: number): Promise<{ order: OrderDetail }> {
  return request<{ order: OrderDetail }>(`${ENDPOINTS.CUSTOMER_ORDERS}/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getOrderByTrackingToken(trackingToken: string): Promise<{ order: OrderDetail }> {
  // Public endpoint — bypass shared request() to avoid baseUrl concatenation issues
  const res = await fetch(`${API_ORIGIN}/api/orders/track/${trackingToken}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? 'Order not found');
  }
  return res.json() as Promise<{ order: OrderDetail }>;
}

export async function getReorderPayload(token: string, orderId: number): Promise<ReorderPayload> {
  return request(`/customer/orders/${orderId}/reorder`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function initiateOnlinePayment(token: string, orderId: number): Promise<InitiatePaymentResult> {
  return request<InitiatePaymentResult>(ENDPOINTS.ORDER_PAY_BML(orderId), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function completeZeroBalanceOrder(token: string, orderId: number): Promise<{ order: OrderDetail }> {
  return request<{ order: OrderDetail }>(ENDPOINTS.ORDER_COMPLETE_ZERO_BALANCE(orderId), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}
