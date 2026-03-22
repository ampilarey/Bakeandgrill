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

function readCookie(name: string): string | null {
  const m = document.cookie.split('; ').find((r) => r.startsWith(name + '='));
  if (!m) return null;
  return decodeURIComponent(m.split('=').slice(1).join('='));
}

/**
 * Establish a Blade web session from a Sanctum Bearer token.
 * Call after every React login so the main website header shows "Hi, [phone]".
 * Uses a CSRF-exempt web route protected by Sanctum Bearer auth.
 */
export async function syncBladeSession(token: string): Promise<void> {
  if (typeof window === 'undefined') return;
  await fetch(`${API_ORIGIN}/customer/sync-session`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
}

/**
 * Revoke the current Sanctum Bearer token via the API.
 * Call this before clearing localStorage auth so the old token stops working immediately.
 */
export async function revokeCustomerToken(token: string): Promise<void> {
  if (!token) return;
  try {
    await fetch(`${API_BASE_URL}/auth/customer/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
  } catch {
    /* ignore — token may already be gone */
  }
}

/**
 * Invalidate the Blade customer web session (same cookie as main website).
 * Call this when signing out from the order app so the main site header
 * shows "Login" instead of the phone number.
 */
export async function logoutCustomerWebSession(): Promise<void> {
  if (typeof window === 'undefined') return;
  const origin = API_ORIGIN;
  try {
    await fetch(`${origin}/sanctum/csrf-cookie`, {
      method: 'GET',
      credentials: 'include',
    });
  } catch {
    /* cookie may already exist */
  }
  const xsrf = readCookie('XSRF-TOKEN');
  const headers: Record<string, string> = {
    Accept: 'text/html,application/xhtml+xml',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (xsrf) headers['X-XSRF-TOKEN'] = xsrf;
  await fetch(`${origin}/customer/logout`, {
    method: 'POST',
    credentials: 'include',
    headers,
  });
}

// Re-export MenuItem so consumers can also import by its original name
export type { MenuItem };

// credentials: 'include' sends the session cookie on every request, enabling:
// - GET /api/auth/customer/check to detect Blade-site logins (unified auth)
// - Sanctum SPA cookie authentication for same-domain requests
const client = createApiClient({ baseUrl: API_BASE_URL, credentials: 'include' });
const { request } = client;

// ── Auth ─────────────────────────────────────────────────────────────────────

export type AuthCustomer = Customer & {
  is_profile_complete: boolean;
};

export type AuthResponse = {
  token: string;
  customer: AuthCustomer;
  is_new_customer?: boolean;
};

/** Check if a phone has an account and has set a password. */
export async function checkPhone(phone: string): Promise<{ exists: boolean; has_password: boolean }> {
  return request(ENDPOINTS.CUSTOMER_CHECK_PHONE, {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

/** Password-based login for returning customers (no OTP / SMS cost). */
export async function passwordLogin(payload: {
  phone: string;
  password: string;
}): Promise<AuthResponse> {
  return request<AuthResponse>(ENDPOINTS.CUSTOMER_PASSWORD_LOGIN, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Request OTP for new customers or password reset. */
export async function requestOtp(phone: string, purpose: 'register' | 'reset_password' = 'register'): Promise<{ otp?: string }> {
  return request<{ otp?: string }>(ENDPOINTS.CUSTOMER_OTP_REQUEST, {
    method: 'POST',
    body: JSON.stringify({ phone, purpose }),
  });
}

/** Verify OTP and register / login. */
export async function verifyOtp(payload: {
  phone: string;
  otp: string;
}): Promise<AuthResponse> {
  return request<AuthResponse>(
    ENDPOINTS.CUSTOMER_OTP_VERIFY,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

/**
 * Check if the customer is already authenticated via the session cookie
 * (e.g. logged in on the Blade site). Returns a fresh Bearer token if so.
 * Called by Layout on mount for unified cross-app auth.
 */
export async function checkSession(): Promise<AuthResponse & { authenticated: boolean }> {
  return request(ENDPOINTS.CUSTOMER_SESSION_CHECK);
}

/** Send OTP for password reset. */
export async function forgotPassword(phone: string): Promise<{ otp?: string }> {
  return request(ENDPOINTS.CUSTOMER_FORGOT_PASSWORD, {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

/** Verify OTP and set a new password. */
export async function resetPassword(payload: {
  phone: string;
  otp: string;
  password: string;
  password_confirmation: string;
}): Promise<AuthResponse> {
  return request<AuthResponse>(ENDPOINTS.CUSTOMER_RESET_PASSWORD, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** First-time profile setup after OTP registration. */
export async function completeProfile(
  token: string,
  payload: { name: string; email?: string; password: string; password_confirmation: string },
): Promise<{ customer: AuthCustomer }> {
  return request(ENDPOINTS.CUSTOMER_COMPLETE_PROFILE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

/** Update the logged-in customer's profile (name / email). */
export async function updateCustomerProfile(
  token: string,
  data: { name?: string; email?: string },
): Promise<{ customer: AuthCustomer }> {
  return request(ENDPOINTS.CUSTOMER_PROFILE, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

/**
 * Change password for a logged-in customer (new flow: current + new + confirm).
 * Re-uses the CUSTOMER_CHANGE_PASSWORD endpoint with different field names than
 * `changePassword` (which uses `password` / `password_confirmation`).
 */
export async function changeCustomerPassword(
  token: string,
  data: { current_password: string; new_password: string },
): Promise<void> {
  await request(ENDPOINTS.CUSTOMER_CHANGE_PASSWORD, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      current_password: data.current_password,
      password: data.new_password,
      password_confirmation: data.new_password,
    }),
  });
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
  signal?: AbortSignal,
): Promise<{ data: Order[] }> {
  return request<{ data: Order[] }>(ENDPOINTS.CUSTOMER_ORDERS, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
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

export async function getOrderByTrackingToken(
  trackingToken: string,
): Promise<{ order: OrderDetail }> {
  // Use fetch directly — this is a public endpoint with no auth, and bypassing
  // the shared request() helper avoids any baseUrl concatenation issues.
  const res = await fetch(`${API_ORIGIN}/api/orders/track/${trackingToken}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? 'Order not found');
  }
  return res.json() as Promise<{ order: OrderDetail }>;
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
): Promise<{ order: OrderDetail; discount_laar: number; promotion_id: number }> {
  return request<{ order: OrderDetail; discount_laar: number; promotion_id: number }>(
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
