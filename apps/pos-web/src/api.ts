import type { Category, Item, RestaurantTable, StaffLoginResponse } from "./types";

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Request failed");
  }
  return response.json() as Promise<T>;
}

export async function fetchCategories(): Promise<Category[]> {
  const response = await fetch(`${apiBaseUrl}/categories`, {
    headers: { "Content-Type": "application/json" },
  });
  const data = await handleResponse<{ categories: Category[] }>(response);
  return data.categories ?? [];
}

export async function fetchItems(): Promise<Item[]> {
  const response = await fetch(`${apiBaseUrl}/items`, {
    headers: { "Content-Type": "application/json" },
  });
  const data = await handleResponse<{ data: Item[] }>(response);
  return data.data ?? [];
}

export async function lookupBarcode(barcode: string): Promise<Item | null> {
  const response = await fetch(`${apiBaseUrl}/items/barcode/${barcode}`, {
    headers: { "Content-Type": "application/json" },
  });
  const data = await handleResponse<{ item: Item }>(response);
  return data.item ?? null;
}

export async function staffLogin(
  pin: string,
  deviceIdentifier: string
): Promise<StaffLoginResponse> {
  const response = await fetch(`${apiBaseUrl}/auth/staff/pin-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pin,
      device_identifier: deviceIdentifier,
    }),
  });
  return handleResponse<StaffLoginResponse>(response);
}

export async function createOrder(
  token: string,
  payload: {
    type: string;
    print?: boolean;
    device_identifier?: string;
    restaurant_table_id?: number | null;
    items: Array<{
      item_id?: number | null;
      name: string;
      quantity: number;
      modifiers?: Array<{
        modifier_id?: number | null;
        name: string;
        price: number;
      }>;
    }>;
  }
): Promise<{ order: { id: number; total: number } }> {
  const response = await fetch(`${apiBaseUrl}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return handleResponse<{ order: { id: number; total: number } }>(response);
}

export async function fetchTables(
  token: string
): Promise<{ tables: RestaurantTable[] }> {
  const response = await fetch(`${apiBaseUrl}/tables`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse<{ tables: RestaurantTable[] }>(response);
}

export async function createOrderBatch(
  token: string,
  payload: {
    orders: Array<{
      type: string;
      print?: boolean;
      device_identifier?: string;
      restaurant_table_id?: number | null;
      items: Array<{
        item_id?: number | null;
        name: string;
        quantity: number;
        modifiers?: Array<{
          modifier_id?: number | null;
          name: string;
          price: number;
        }>;
      }>;
    }>;
  }
): Promise<{ processed: number; failed: Array<{ index: number; error: string }> }> {
  const response = await fetch(`${apiBaseUrl}/orders/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return handleResponse<{
    processed: number;
    failed: Array<{ index: number; error: string }>;
  }>(response);
}

export async function createOrderPayments(
  token: string,
  orderId: number,
  payload: {
    payments: Array<{
      method: string;
      amount: number;
      status?: string;
      reference_number?: string;
    }>;
    print_receipt?: boolean;
  }
): Promise<{ order: { id: number; total: number }; paid_total: number }> {
  const response = await fetch(`${apiBaseUrl}/orders/${orderId}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return handleResponse<{
    order: { id: number; total: number };
    paid_total: number;
  }>(response);
}

export async function getOrder(token: string, orderId: number): Promise<{
  order: {
    id: number;
    items: Array<{
      item_id: number | null;
      item_name: string;
      unit_price: number;
      quantity: number;
      modifiers?: Array<{
        modifier_id: number | null;
        modifier_name: string;
        modifier_price: number;
      }>;
    }>;
  };
}> {
  const response = await fetch(`${apiBaseUrl}/orders/${orderId}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse<{
    order: {
      id: number;
      items: Array<{
        item_id: number | null;
        item_name: string;
        unit_price: number;
        quantity: number;
        modifiers?: Array<{
          modifier_id: number | null;
          modifier_name: string;
          modifier_price: number;
        }>;
      }>;
    };
  }>(response);
}

export async function holdOrder(token: string, orderId: number): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/orders/${orderId}/hold`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  await handleResponse(response);
}

export async function resumeOrder(token: string, orderId: number): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/orders/${orderId}/resume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  await handleResponse(response);
}

export async function getCurrentShift(token: string): Promise<{
  shift: {
    id: number;
    opened_at: string;
    closed_at: string | null;
    opening_cash: number;
    closing_cash: number | null;
    expected_cash: number | null;
    variance: number | null;
  } | null;
}> {
  const response = await fetch(`${apiBaseUrl}/shifts/current`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(response);
}

export async function openShift(
  token: string,
  payload: { opening_cash: number; device_id?: number | null; notes?: string }
): Promise<{ shift: { id: number } }> {
  const response = await fetch(`${apiBaseUrl}/shifts/open`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function closeShift(
  token: string,
  shiftId: number,
  payload: { closing_cash: number; notes?: string }
): Promise<{
  shift: { id: number; expected_cash: number | null; variance: number | null };
  cash_sales: number;
  cash_in: number;
  cash_out: number;
}> {
  const response = await fetch(`${apiBaseUrl}/shifts/${shiftId}/close`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function createCashMovement(
  token: string,
  shiftId: number,
  payload: { type: "cash_in" | "cash_out"; amount: number; reason: string }
): Promise<{ movement: { id: number } }> {
  const response = await fetch(`${apiBaseUrl}/shifts/${shiftId}/cash-movements`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function getSalesSummary(
  token: string,
  params: { from?: string; to?: string }
): Promise<{
  totals: {
    orders_count: number;
    subtotal: number;
    tax_amount: number;
    discount_amount: number;
    total: number;
  };
  payments: Record<string, number>;
}> {
  const query = new URLSearchParams();
  if (params.from) {
    query.set("from", params.from);
  }
  if (params.to) {
    query.set("to", params.to);
  }
  const response = await fetch(
    `${apiBaseUrl}/reports/sales-summary?${query.toString()}`,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return handleResponse(response);
}

export async function fetchInventory(
  token: string
): Promise<{ items: { data: Array<{ id: number; name: string; current_stock: number | null; unit: string }> } }> {
  const response = await fetch(`${apiBaseUrl}/inventory`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(response);
}

export async function adjustInventory(
  token: string,
  itemId: number,
  payload: { quantity: number; type: "adjustment" | "waste" | "correction"; notes?: string }
): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/inventory/${itemId}/adjust`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  await handleResponse(response);
}

export async function fetchSuppliers(
  token: string
): Promise<{ suppliers: { data: Array<{ id: number; name: string }> } }> {
  const response = await fetch(`${apiBaseUrl}/suppliers`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(response);
}

export async function createSupplier(
  token: string,
  payload: { name: string; phone?: string; email?: string }
): Promise<{ supplier: { id: number; name: string } }> {
  const response = await fetch(`${apiBaseUrl}/suppliers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function createPurchase(
  token: string,
  payload: {
    supplier_id?: number | null;
    purchase_date: string;
    items: Array<{
      inventory_item_id?: number | null;
      name: string;
      quantity: number;
      unit_cost: number;
    }>;
  }
): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/purchases`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  await handleResponse(response);
}

export async function fetchRefunds(
  token: string,
  status?: string
): Promise<{ refunds: { data: Array<{ id: number; amount: number; status: string; reason: string | null; order_id: number }> } }> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const response = await fetch(`${apiBaseUrl}/refunds${query}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(response);
}

export async function createRefund(
  token: string,
  orderId: number,
  payload: { amount: number; reason?: string; status?: string }
): Promise<{ refund: { id: number } }> {
  const response = await fetch(`${apiBaseUrl}/orders/${orderId}/refunds`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function previewSmsPromotion(
  token: string,
  payload: {
    message: string;
    filters?: {
      active_only?: boolean;
      last_order_days?: number;
      min_orders?: number;
      include_opted_out?: boolean;
    };
  }
): Promise<{
  estimate: {
    encoding: string;
    length: number;
    segments: number;
    cost_mvr: number;
    recipient_count: number;
    total_cost_mvr: number;
  };
}> {
  const response = await fetch(`${apiBaseUrl}/sms/promotions/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function sendSmsPromotion(
  token: string,
  payload: {
    name?: string;
    message: string;
    filters?: {
      active_only?: boolean;
      last_order_days?: number;
      min_orders?: number;
      include_opted_out?: boolean;
    };
  }
): Promise<{ promotion: { id: number; status: string } }> {
  const response = await fetch(`${apiBaseUrl}/sms/promotions/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}
