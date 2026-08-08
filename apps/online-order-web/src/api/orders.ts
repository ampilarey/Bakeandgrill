// ── Orders & Payments ──────────────────────────────────────────────────────────
import { ENDPOINTS } from '@shared/api';
import type { Order, OrderItem, InitiatePaymentResult } from '@shared/types';
import { API_ORIGIN, request } from './client';

export type OrderDetail = Order & {
  items?: OrderItem[];
  payments?: Array<{ method: string; amount: number; status: string }>;
  remaining_balance_laar?: number;
  /** Points credited when the order completed (customer order API). */
  loyalty_points_earned?: number;
  pickup_slot_at?: string | null;
  fulfil_date?: string | null;
  /** When kitchen received the ticket (null = still held / unstarted). */
  fired_at?: string | null;
  /** Server-computed: customer may self-cancel before kitchen starts. */
  can_cancel?: boolean;
  /** Prepaid dine-in: table hold created with the order. */
  reservation?: {
    status: string;
    date: string;
    time_slot: string;
    party_size: number;
    table: { id: number; name: string } | null;
  } | null;
  estimated_wait_minutes?: number | null;
  proof_of_delivery_url?: string | null;
};

export type OrderLineChildPayload = {
  item_id: number;
  quantity: number;
  group_id?: number;
  surcharge?: number;
};

export type DeliveryOrderPayload = {
  items: Array<{
    item_id: number;
    quantity: number;
    variant_id?: number;
    packaging_option_id?: number;
    modifiers?: Array<{ modifier_id: number }>;
    children?: OrderLineChildPayload[];
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
  collect_on?: 'today' | 'tomorrow';
  fulfil_date?: string;
  reward_claims?: Array<{ promotion_id: number; item_id: number }>;
};

export interface ReorderPayload {
  items: {
    item_id: number;
    quantity: number;
    item_name: string;
    unit_price: number;
    variant_id?: number | null;
    is_platter?: boolean;
    children?: Array<{
      item_id: number;
      item_name: string;
      quantity: number;
      unit_price?: number;
      surcharge?: number;
      group_id?: number;
    }>;
    name?: string;
    price?: number;
    modifiers: { id: number; name: string; price: number }[];
  }[];
  original_type?: string;
}

export async function fetchCustomerOrders(signal?: AbortSignal): Promise<{ data: Order[] }> {
  return request<{ data: Order[] }>(ENDPOINTS.CUSTOMER_ORDERS, { signal });
}

export async function createCustomerOrder(
  payload: {
    items: Array<{
      item_id: number;
      quantity: number;
      variant_id?: number;
      packaging_option_id?: number;
      modifiers?: Array<{ modifier_id: number; quantity?: number }>;
      children?: OrderLineChildPayload[];
    }>;
    customer_notes?: string;
    type?: string;
    pickup_slot_at?: string;
    collect_on?: 'today' | 'tomorrow';
    fulfil_date?: string;
    /** Prepaid dine-in: how many people are coming. */
    party_size?: number;
    reward_claims?: Array<{ promotion_id: number; item_id: number }>;
  },
): Promise<{ order: Order }> {
  return request<{ order: Order }>(ENDPOINTS.CUSTOMER_ORDERS, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createDeliveryOrder(payload: DeliveryOrderPayload): Promise<{ order: OrderDetail }> {
  return request<{ order: OrderDetail }>(ENDPOINTS.DELIVERY_ORDER, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getOrderDetail(orderId: number): Promise<{ order: OrderDetail }> {
  return request<{ order: OrderDetail }>(`${ENDPOINTS.CUSTOMER_ORDERS}/${orderId}`);
}

export type CancelCustomerOrderResult = {
  message: string;
  order: Pick<OrderDetail, 'id' | 'order_number' | 'status' | 'payment_status' | 'fired_at' | 'can_cancel'> & {
    reservation?: { status: string } | null;
  };
  refund: {
    id: number;
    amount: number;
    status: string;
    initiated_by: string;
    reason_category: string | null;
  } | null;
  refunded: boolean;
};

/** Customer self-cancel before kitchen starts (auth: customer session). */
export async function cancelCustomerOrder(orderId: number): Promise<CancelCustomerOrderResult> {
  return request<CancelCustomerOrderResult>(`${ENDPOINTS.CUSTOMER_ORDERS}/${orderId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
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

export async function getReorderPayload(orderId: number): Promise<ReorderPayload> {
  return request(`/customer/orders/${orderId}/reorder`);
}

export async function initiateOnlinePayment(orderId: number): Promise<InitiatePaymentResult> {
  return request<InitiatePaymentResult>(ENDPOINTS.ORDER_PAY_BML(orderId), {
    method: 'POST',
  });
}

export type InitiatePartialPaymentResult = {
  payment_url: string;
  payment_id: number;
  amount_laar: number;
  remaining_balance_before_laar: number;
  remaining_balance_after_laar: number;
  reused: boolean;
};

export async function initiatePartialPayment(
  orderId: number,
  amountLaar: number,
  idempotencyKey: string,
): Promise<InitiatePartialPaymentResult> {
  return request<InitiatePartialPaymentResult>(ENDPOINTS.PARTIAL_PAYMENT, {
    method: 'POST',
    body: JSON.stringify({
      order_id: orderId,
      amount: amountLaar,
      idempotency_key: idempotencyKey,
    }),
  });
}

export async function completeZeroBalanceOrder(orderId: number): Promise<{ order: OrderDetail }> {
  return request<{ order: OrderDetail }>(ENDPOINTS.ORDER_COMPLETE_ZERO_BALANCE(orderId), {
    method: 'POST',
  });
}
