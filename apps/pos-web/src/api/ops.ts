import { request } from "./client";

export async function fetchInventory(): Promise<{
  items: {
    data: Array<{
      id: number;
      name: string;
      current_stock: number | null;
      unit: string;
      reorder_point?: number | null;
    }>;
  };
}> {
  return request("/inventory?active_only=1");
}

export async function createWasteLog(payload: {
  inventory_item_id: number;
  quantity: number;
  reason: "spoilage" | "over_prep" | "drop" | "expired" | "quality" | "other";
  notes?: string;
  unit?: string;
}): Promise<void> {
  await request("/waste-logs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
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

export type PreparedStockRow = {
  item_id: number;
  variant_id: number | null;
  name: string;
  stock: number;
  low_stock_threshold: number;
};

export async function fetchPreparedStock(): Promise<{ items: PreparedStockRow[] }> {
  return request("/prepared-stock");
}

export async function adjustPreparedStock(
  itemId: number,
  payload: { delta: number; variant_id?: number | null; notes?: string },
): Promise<{ message: string; item: PreparedStockRow }> {
  return request(`/items/${itemId}/prepared-stock/adjust`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type SnoozeUntil = "2_hours" | "end_of_day" | "tomorrow" | "date" | "indefinite" | null;

export async function snoozeItem(
  itemId: number,
  until: SnoozeUntil,
  opts?: { until_date?: string; unavailable_reason_note?: string | null },
): Promise<{
  message: string;
  item: {
    id: number;
    name: string;
    is_available?: boolean;
    snoozed_until: string | null;
    is_snoozed: boolean;
    unavailable_reason_note?: string | null;
  };
}> {
  return request(`/items/${itemId}/snooze`, {
    method: "PATCH",
    body: JSON.stringify({
      until,
      ...(opts?.until_date ? { until_date: opts.until_date } : {}),
      ...(opts && "unavailable_reason_note" in opts
        ? { unavailable_reason_note: opts.unavailable_reason_note }
        : {}),
    }),
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
  status?: string;
  items: Array<{
    inventory_item_id: number;
    name?: string;
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

/**
 * FIX 1e — POS-triggered refund.
 *
 * The client only sends the amount, an optional reason, and the
 * `cash_refund_override` flag (when the cashier ticks "Refund card
 * portion in cash"). All settlement breakdown is decided server-side:
 * the backend inspects the order's payment mix, reverses each tender
 * proportionally, and returns the resulting per-method laari splits
 * in `breakdown` so we can show the cashier exactly what happened.
 *
 * The `cash_refund_override` boolean is the only mutation lever the
 * POS gets — amounts are never forwarded, which prevents an accidental
 * "refund more card than was charged" bug from the client side.
 */
export async function createRefund(
  orderId: number,
  payload: {
    amount: number;
    reason?: string;
    status?: string;
    cash_refund_override?: boolean;
  }
): Promise<{
  refund: {
    id: number;
    amount?: number;
    breakdown?: {
      cash_laar?: number;
      card_laar?: number;
      transfer_laar?: number;
      qr_laar?: number;
      house_account_laar?: number;
      wallet_laar?: number;
      other_laar?: number;
    } | null;
    cash_refund_override?: boolean;
    message?: string;
  };
}> {
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
