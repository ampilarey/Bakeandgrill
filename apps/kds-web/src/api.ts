type KdsOrderItem = {
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
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Request failed");
  }
  return response.json() as Promise<T>;
}

export async function staffLogin(pin: string, deviceIdentifier: string): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/auth/staff/pin-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin, device_identifier: deviceIdentifier }),
  });
  const data = await handleResponse<{ token: string }>(response);
  return data.token;
}

export async function fetchKdsOrders(token: string): Promise<KdsOrder[]> {
  const response = await fetch(`${apiBaseUrl}/kds/orders`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await handleResponse<{ orders: KdsOrder[] }>(response);
  return data.orders ?? [];
}

export async function startOrder(token: string, orderId: number): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/kds/orders/${orderId}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  await handleResponse(response);
}

export async function bumpOrder(token: string, orderId: number): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/kds/orders/${orderId}/bump`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  await handleResponse(response);
}

export async function recallOrder(token: string, orderId: number): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/kds/orders/${orderId}/recall`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  await handleResponse(response);
}
