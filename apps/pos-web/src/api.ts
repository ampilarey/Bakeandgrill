import { createApiClient } from "@shared/api";
import type {
  Category,
  MenuItem as Item,
  RestaurantTable,
  SalesSummary,
  StaffLoginResponse,
} from "@shared/types";

export type { SalesSummary };

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.PROD ? "/api" : "http://localhost:8000/api");

if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  // eslint-disable-next-line no-console
  console.warn("[CONFIG] VITE_API_BASE_URL is not set — falling back to same-origin /api");
}

// Module-level token — initialised from localStorage so page refresh
// doesn't silently log out the POS. Cleared on explicit logout.
let _token: string | null = localStorage.getItem('pos_token');
export function setAuthToken(t: string | null): void {
  _token = t;
}

const { request } = createApiClient({
  baseUrl: API_BASE_URL,
  getToken: () => _token,
});

export async function fetchCategories(): Promise<Category[]> {
  const data = await request<{ categories: Category[] }>("/categories");
  return data.categories ?? [];
}

export async function fetchItems(): Promise<Item[]> {
  const data = await request<{ data: Item[] }>("/items");
  return data.data ?? [];
}

export async function lookupBarcode(barcode: string): Promise<Item | null> {
  const data = await request<{ item: Item }>(`/items/barcode/${barcode}`);
  return data.item ?? null;
}

export async function staffLogin(
  pin: string,
  deviceIdentifier: string
): Promise<StaffLoginResponse> {
  return request<StaffLoginResponse>("/auth/staff/pin-login", {
    method: "POST",
    body: JSON.stringify({ pin, device_identifier: deviceIdentifier }),
  });
}

export async function createOrder(payload: {
  type: string;
  print?: boolean;
  device_identifier?: string;
  restaurant_table_id?: number | null;
  discount_amount?: number;
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
}): Promise<{ order: { id: number; total: number } }> {
  return request("/orders", { method: "POST", body: JSON.stringify(payload) });
}

export async function fetchTables(): Promise<{ tables: RestaurantTable[] }> {
  return request<{ tables: RestaurantTable[] }>("/tables");
}

export async function createOrderBatch(payload: {
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
}): Promise<{ processed: number; failed: Array<{ index: number; error: string }> }> {
  return request("/orders/sync", { method: "POST", body: JSON.stringify(payload) });
}

export async function createOrderPayments(
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
  return request(`/orders/${orderId}/payments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getOrder(orderId: number): Promise<{
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
  return request(`/orders/${orderId}`);
}

export async function holdOrder(orderId: number): Promise<void> {
  await request(`/orders/${orderId}/hold`, { method: "POST" });
}

export async function resumeOrder(orderId: number): Promise<void> {
  await request(`/orders/${orderId}/resume`, { method: "POST" });
}

export async function getCurrentShift(): Promise<{
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
  return request("/shifts/current");
}

export async function openShift(payload: {
  opening_cash: number;
  device_id?: number | null;
  notes?: string;
}): Promise<{ shift: { id: number } }> {
  return request("/shifts/open", { method: "POST", body: JSON.stringify(payload) });
}

export async function closeShift(
  shiftId: number,
  payload: { closing_cash: number; notes?: string }
): Promise<{
  shift: { id: number; expected_cash: number | null; variance: number | null };
  cash_sales: number;
  cash_in: number;
  cash_out: number;
}> {
  return request(`/shifts/${shiftId}/close`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createCashMovement(
  shiftId: number,
  payload: { type: "cash_in" | "cash_out"; amount: number; reason: string }
): Promise<{ movement: { id: number } }> {
  return request(`/shifts/${shiftId}/cash-movements`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getSalesSummary(params: {
  from?: string;
  to?: string;
}): Promise<SalesSummary> {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  return request(`/reports/sales-summary?${query.toString()}`);
}

export async function fetchInventory(): Promise<{
  items: {
    data: Array<{
      id: number;
      name: string;
      current_stock: number | null;
      unit: string;
    }>;
  };
}> {
  return request("/inventory");
}

export async function adjustInventory(
  itemId: number,
  payload: {
    quantity: number;
    type: "adjustment" | "waste" | "correction";
    notes?: string;
  }
): Promise<void> {
  await request(`/inventory/${itemId}/adjust`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchSuppliers(): Promise<{
  suppliers: { data: Array<{ id: number; name: string }> };
}> {
  return request("/suppliers");
}

export async function createSupplier(payload: {
  name: string;
  phone?: string;
  email?: string;
}): Promise<{ supplier: { id: number; name: string } }> {
  return request("/suppliers", { method: "POST", body: JSON.stringify(payload) });
}

export async function createPurchase(payload: {
  supplier_id?: number | null;
  purchase_date: string;
  items: Array<{
    inventory_item_id?: number | null;
    name: string;
    quantity: number;
    unit_cost: number;
  }>;
}): Promise<void> {
  await request("/purchases", { method: "POST", body: JSON.stringify(payload) });
}

export async function fetchRefunds(status?: string): Promise<{
  refunds: {
    data: Array<{
      id: number;
      amount: number;
      status: string;
      reason: string | null;
      order_id: number;
    }>;
  };
}> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return request(`/refunds${query}`);
}

export async function createRefund(
  orderId: number,
  payload: { amount: number; reason?: string; status?: string }
): Promise<{ refund: { id: number } }> {
  return request(`/orders/${orderId}/refunds`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function previewSmsPromotion(payload: {
  message: string;
  filters?: {
    active_only?: boolean;
    last_order_days?: number;
    min_orders?: number;
    include_opted_out?: boolean;
  };
}): Promise<{
  estimate: {
    encoding: string;
    length: number;
    segments: number;
    cost_mvr: number;
    recipient_count: number;
    total_cost_mvr: number;
  };
}> {
  return request("/sms/promotions/preview", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function sendSmsPromotion(payload: {
  name?: string;
  message: string;
  filters?: {
    active_only?: boolean;
    last_order_days?: number;
    min_orders?: number;
    include_opted_out?: boolean;
  };
}): Promise<{ promotion: { id: number; status: string } }> {
  return request("/sms/promotions/send", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function sendBill(
  orderId: number,
  phone: string,
): Promise<{ order: unknown; invoice: unknown; link: string }> {
  return request(`/orders/${orderId}/send-bill`, {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}
