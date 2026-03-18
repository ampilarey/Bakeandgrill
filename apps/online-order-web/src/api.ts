// Types are defined in @shared — re-exported here for convenience
export type {
  Category,
  MenuItem as Item,
  Modifier,
  Customer,
  Order,
  OrderItem,
  LoyaltyAccount,
  LoyaltyHoldPreview,
  InitiatePaymentResult,
  PromoValidation,
  OpeningHoursStatus,
} from '@shared/types';

import { createApiClient } from '@shared/api';
import { ENDPOINTS } from '@shared/api';
import type {
  Category,
  MenuItem,
  Customer,
  Order,
  OrderItem,
  LoyaltyAccount,
  LoyaltyHoldPreview,
  InitiatePaymentResult,
  PromoValidation,
  OpeningHoursStatus,
} from '@shared/types';

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.PROD ? '/api' : 'http://localhost:8000/api');


/** Base URL for images (same origin as API, no /api suffix) */
export const API_ORIGIN =
  API_BASE_URL.replace(/\/api\/?$/, '') ||
  (import.meta.env.PROD ? '' : 'http://localhost:8000');

// Re-export MenuItem so consumers can also import by its original name
export type { MenuItem };

const client = createApiClient({ baseUrl: API_BASE_URL });
const { request } = client;

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function requestOtp(phone: string): Promise<{ otp?: string }> {
  return request<{ otp?: string }>(ENDPOINTS.CUSTOMER_OTP_REQUEST, {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export async function verifyOtp(payload: {
  phone: string;
  otp: string;
}): Promise<{ token: string; customer: Customer }> {
  return request<{ token: string; customer: Customer }>(
    ENDPOINTS.CUSTOMER_OTP_VERIFY,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

// ── Opening hours ─────────────────────────────────────────────────────────────

export async function fetchOpeningHoursStatus(): Promise<OpeningHoursStatus> {
  return request<OpeningHoursStatus>(ENDPOINTS.OPENING_HOURS_STATUS);
}

export type DaySchedule = {
  open: string;   // e.g. "07:00"
  close: string;  // e.g. "22:00"
  closed?: boolean;
};

export async function fetchOpeningHoursSchedule(): Promise<{
  schedule: Record<string, DaySchedule>;
  open: boolean;
  closure_reason: string | null;
}> {
  return request(ENDPOINTS.OPENING_HOURS_SCHEDULE);
}

// ── Pre-orders ────────────────────────────────────────────────────────────────

export type PreOrderPayload = {
  items: Array<{ item_id: number; quantity: number }>;
  fulfillment_date: string;
  customer_notes?: string;
};

export type PreOrderResult = {
  id: number;
  order_number: string;
  items: Array<{ item_id: number; name: string; quantity: number; price: number; total: number }>;
  subtotal: number;
  total: number;
  fulfillment_date: string;
  status: string;
};

export async function createPreOrder(
  token: string,
  payload: PreOrderPayload,
): Promise<{ pre_order: PreOrderResult }> {
  return request<{ pre_order: PreOrderResult }>(ENDPOINTS.CUSTOMER_PRE_ORDERS, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

// ── Menu ──────────────────────────────────────────────────────────────────────

export async function fetchCategories(): Promise<{ data: Category[] }> {
  return request<{ data: Category[] }>(ENDPOINTS.CATEGORIES);
}

export async function fetchItems(): Promise<{ data: MenuItem[] }> {
  const res = await request<{ data: MenuItem[] }>(`${ENDPOINTS.ITEMS}?available_only=1`);
  // Coerce prices to numbers at the API boundary so consumers never need parseFloat()
  res.data = res.data.map((item) => ({
    ...item,
    base_price: Number(item.base_price),
    modifiers: item.modifiers?.map((m) => ({ ...m, price: Number(m.price) })),
  }));
  return res;
}

// ── Customer ─────────────────────────────────────────────────────────────────

export async function getCustomerMe(
  token: string,
): Promise<{ customer: Customer }> {
  return request<{ customer: Customer }>(ENDPOINTS.CUSTOMER_ME, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchCustomerOrders(
  token: string,
): Promise<{ data: Order[] }> {
  return request<{ data: Order[] }>(ENDPOINTS.CUSTOMER_ORDERS, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Orders ────────────────────────────────────────────────────────────────────

export type OrderDetail = Order & {
  items?: OrderItem[];
  payments?: Array<{ method: string; amount: number; status: string }>;
};

export type DeliveryOrderPayload = {
  items: Array<{
    item_id: number;
    quantity: number;
    modifiers?: Array<{ modifier_id: number }>;
  }>;
  delivery_address_line1: string;
  delivery_address_line2?: string;
  delivery_island: string;
  delivery_contact_name: string;
  delivery_contact_phone: string;
  delivery_notes?: string;
  desired_eta?: string;
  customer_notes?: string;
};

export async function createCustomerOrder(
  token: string,
  payload: {
    items: Array<{
      item_id: number;
      quantity: number;
      variant_id?: number;
      modifiers?: Array<{ modifier_id: number; quantity?: number }>;
    }>;
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

export async function createDeliveryOrder(
  token: string,
  payload: DeliveryOrderPayload,
): Promise<{ order: OrderDetail }> {
  return request<{ order: OrderDetail }>(ENDPOINTS.DELIVERY_ORDER, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function getOrderDetail(
  token: string,
  orderId: number,
): Promise<{ order: OrderDetail }> {
  return request<{ order: OrderDetail }>(`${ENDPOINTS.CUSTOMER_ORDERS}/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── BML Payment ───────────────────────────────────────────────────────────────

export async function initiateOnlinePayment(
  token: string,
  orderId: number,
): Promise<InitiatePaymentResult> {
  return request<InitiatePaymentResult>(ENDPOINTS.ORDER_PAY_BML(orderId), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Promotions ────────────────────────────────────────────────────────────────

export async function validatePromoCode(
  code: string,
  token?: string,
): Promise<PromoValidation> {
  return request<PromoValidation>(ENDPOINTS.PROMOTIONS_VALIDATE, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify({ code }),
  });
}

export async function applyPromoCode(
  token: string,
  orderId: number,
  code: string,
): Promise<{ order: OrderDetail; discount_laar: number }> {
  return request<{ order: OrderDetail; discount_laar: number }>(
    ENDPOINTS.ORDER_APPLY_PROMO(orderId),
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code }),
    },
  );
}

export async function removePromoCode(
  token: string,
  orderId: number,
  promotionId: number,
): Promise<{ order: OrderDetail }> {
  return request<{ order: OrderDetail }>(
    ENDPOINTS.ORDER_REMOVE_PROMO(orderId, promotionId),
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

// ── Loyalty ───────────────────────────────────────────────────────────────────

export async function getLoyaltyAccount(
  token: string,
): Promise<{ account: LoyaltyAccount | null }> {
  return request<{ account: LoyaltyAccount | null }>(ENDPOINTS.LOYALTY_ME, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function previewLoyaltyHold(
  token: string,
  orderId: number,
  points: number,
): Promise<LoyaltyHoldPreview> {
  return request<LoyaltyHoldPreview>(ENDPOINTS.LOYALTY_HOLD_PREVIEW, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ order_id: orderId, points }),
  });
}

export async function createLoyaltyHold(
  token: string,
  orderId: number,
  points: number,
): Promise<{ hold: { points_held: number; discount_laar: number } }> {
  return request<{ hold: { points_held: number; discount_laar: number } }>(
    ENDPOINTS.LOYALTY_HOLD,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ order_id: orderId, points }),
    },
  );
}

export async function releaseLoyaltyHold(
  token: string,
  orderId: number,
): Promise<void> {
  await request<void>(`${ENDPOINTS.LOYALTY_HOLD}/${orderId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Reservations ─────────────────────────────────────────────────────────────

export type ReservationSlot = { time_slot: string; available: boolean };
export type Reservation = {
  id: number;
  customer_name: string;
  date: string;
  time_slot: string;
  party_size: number;
  table?: { id: number; name: string };
};

export async function fetchReservationSlots(
  date: string,
  partySize: number,
): Promise<ReservationSlot[]> {
  const data = await request<{ slots: ReservationSlot[] }>(
    `${ENDPOINTS.RESERVATIONS_AVAILABILITY}?date=${date}&party_size=${partySize}`,
  );
  return data.slots;
}

export async function createReservation(payload: {
  customer_name: string;
  customer_phone: string;
  party_size: number;
  date: string;
  time_slot: string;
  notes?: string;
}): Promise<Reservation> {
  const data = await request<{ reservation: Reservation }>(ENDPOINTS.RESERVATIONS, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.reservation;
}

// ── Reviews ───────────────────────────────────────────────────────────────────

export async function submitReview(
  token: string,
  payload: { order_id: number; rating: number; comment: string; is_anonymous: boolean },
): Promise<void> {
  await request<void>(ENDPOINTS.REVIEWS, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}
