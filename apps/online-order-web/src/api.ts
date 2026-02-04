const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000/api";

/** Base URL for images (same origin as API, no /api suffix) */
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "") || "http://localhost:8000";

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
      item_id: number; // REQUIRED: Server computes price from DB
      quantity: number;
      variant_id?: number;
      modifiers?: Array<{ 
        modifier_id: number; // REQUIRED: Server computes price from DB
        quantity?: number;
      }>;
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
