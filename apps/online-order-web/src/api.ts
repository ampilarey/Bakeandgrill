const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.PROD ? "/api" : "http://localhost:8000/api");

/** Base URL for images (same origin as API, no /api suffix) */
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "") || (import.meta.env.PROD ? "" : "http://localhost:8000");

type ApiError = { message?: string; errors?: Record<string, string[]> };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as ApiError;
    const message =
      errorBody.message ??
      Object.values(errorBody.errors ?? {})[0]?.[0] ??
      "Request failed";
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export type Category = {
  id: number;
  name: string;
  name_dv?: string | null;
  image_url?: string | null;
  parent_id?: number | null;
};

export type Modifier = {
  id: number;
  name: string;
  price: number;
};

export type Item = {
  id: number;
  name: string;
  name_dv?: string | null;
  description?: string | null;
  base_price: number;
  image_url?: string | null;
  category_id: number;
  modifiers?: Modifier[];
};

export type Customer = {
  id: number;
  phone: string;
  name?: string | null;
  email?: string | null;
  loyalty_points?: number;
  tier?: string | null;
};

export type Order = {
  id: number;
  order_number: string;
  status: string;
  total: number;
  created_at: string;
};

export async function requestOtp(phone: string): Promise<{ otp?: string }> {
  return request<{ otp?: string }>("/auth/customer/otp/request", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export async function verifyOtp(payload: {
  phone: string;
  otp: string;
}): Promise<{ token: string; customer: Customer }> {
  return request<{ token: string; customer: Customer }>(
    "/auth/customer/otp/verify",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export type OpeningHoursStatus = { open: boolean; message: string | null };

export async function fetchOpeningHoursStatus(): Promise<OpeningHoursStatus> {
  return request<OpeningHoursStatus>("/opening-hours/status");
}

export async function fetchCategories(): Promise<{ data: Category[] }> {
  return request<{ data: Category[] }>("/categories");
}

export async function fetchItems(): Promise<{ data: Item[] }> {
  return request<{ data: Item[] }>("/items?available_only=1");
}

export async function getCustomerMe(token: string): Promise<{ customer: Customer }> {
  return request<{ customer: Customer }>("/customer/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchCustomerOrders(
  token: string
): Promise<{ data: Order[] }> {
  return request<{ data: Order[] }>("/customer/orders", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

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
  }
): Promise<{ order: Order }> {
  return request<{ order: Order }>("/customer/orders", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

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

export type OrderDetail = Order & {
  type: string;
  total: number;
  subtotal?: number;
  delivery_fee?: number;
  promo_discount_laar?: number;
  loyalty_discount_laar?: number;
  paid_at?: string | null;
  delivery_address_line1?: string;
  delivery_island?: string;
  delivery_contact_name?: string;
  delivery_contact_phone?: string;
};

export async function createDeliveryOrder(
  token: string,
  payload: DeliveryOrderPayload
): Promise<{ order: OrderDetail }> {
  return request<{ order: OrderDetail }>("/orders/delivery", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function getOrderDetail(
  token: string,
  orderId: number
): Promise<{ order: OrderDetail }> {
  return request<{ order: OrderDetail }>(`/customer/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── BML Online Payment ──────────────────────────────────────────────────────

export type InitiatePaymentResult = {
  payment_url: string;
  payment_id: number;
};

export async function initiateOnlinePayment(
  token: string,
  orderId: number
): Promise<InitiatePaymentResult> {
  return request<InitiatePaymentResult>(`/orders/${orderId}/pay/bml`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Promotions ──────────────────────────────────────────────────────────────

export type PromoValidation = {
  valid: boolean;
  promotion?: {
    id: number;
    code: string;
    discount_type: string;
    discount_value: number;
  };
  estimated_discount_laar?: number;
  message?: string;
};

export async function validatePromoCode(
  code: string,
  token?: string
): Promise<PromoValidation> {
  return request<PromoValidation>("/promotions/validate", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify({ code }),
  });
}

export async function applyPromoCode(
  token: string,
  orderId: number,
  code: string
): Promise<{ order: OrderDetail; discount_laar: number }> {
  return request<{ order: OrderDetail; discount_laar: number }>(
    `/orders/${orderId}/apply-promo`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code }),
    }
  );
}

export async function removePromoCode(
  token: string,
  orderId: number,
  promotionId: number
): Promise<{ order: OrderDetail }> {
  return request<{ order: OrderDetail }>(
    `/orders/${orderId}/promo/${promotionId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
}

// ── Loyalty ─────────────────────────────────────────────────────────────────

export type LoyaltyAccount = {
  id: number;
  points_balance: number;
  tier: string;
};

export async function getLoyaltyAccount(
  token: string
): Promise<{ account: LoyaltyAccount | null }> {
  return request<{ account: LoyaltyAccount | null }>("/loyalty/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export type LoyaltyHoldPreview = {
  points: number;
  discount_laar: number;
  discount_mvr: number;
};

export async function previewLoyaltyHold(
  token: string,
  orderId: number,
  points: number
): Promise<LoyaltyHoldPreview> {
  return request<LoyaltyHoldPreview>("/loyalty/hold-preview", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ order_id: orderId, points }),
  });
}

export async function createLoyaltyHold(
  token: string,
  orderId: number,
  points: number
): Promise<{ hold: { points_held: number; discount_laar: number } }> {
  return request<{ hold: { points_held: number; discount_laar: number } }>(
    "/loyalty/hold",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ order_id: orderId, points }),
    }
  );
}

export async function releaseLoyaltyHold(
  token: string,
  orderId: number
): Promise<void> {
  await request<void>(`/loyalty/hold/${orderId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}
