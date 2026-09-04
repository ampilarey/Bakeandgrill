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

export const REFUND_REASON_CATEGORIES = [
  { value: "wrong_item", label: "Wrong item" },
  { value: "quality_complaint", label: "Quality complaint" },
  { value: "order_cancelled", label: "Order cancelled" },
  { value: "duplicate_charge", label: "Duplicate charge" },
  { value: "other", label: "Other" },
] as const;

export type RefundReasonCategory = (typeof REFUND_REASON_CATEGORIES)[number]["value"];

export async function fetchRefunds(status?: string): Promise<{
  refunds: {
    data: Array<{
      id: number;
      amount: number;
      status: string;
      reason: string | null;
      reason_category?: string | null;
      order_id: number;
      refund_phone?: string | null;
      phone_added_at_refund?: boolean;
      no_customer_contact?: boolean;
      rejection_reason?: string | null;
      phone_flags?: {
        refund_phone?: string | null;
        phone_added_at_refund?: boolean;
        has_prior_order_history?: boolean;
        refunds_last_90_days?: number;
        otp_owner_override?: boolean;
      };
    }>;
  };
}> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return request(`/refunds${query}`);
}

/**
 * Request a refund (pending until approved). Money does not move until
 * an authoriser with orders.refund approves — except owners, who may
 * auto-approve in one step server-side.
 */
export async function createRefund(
  orderId: number,
  payload: {
    amount: number;
    reason: string;
    reason_category: RefundReasonCategory;
    cash_refund_override?: boolean;
    refund_phone?: string;
  }
): Promise<{
  refund: {
    id: number;
    amount?: number;
    status?: string;
    refund_phone?: string | null;
    phone_added_at_refund?: boolean;
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
  auto_approved?: boolean;
  breakdown?: Record<string, unknown>;
}> {
  return request(`/orders/${orderId}/refunds`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function approveRefund(
  id: number,
  payload: { otp?: string; owner_override_without_otp?: boolean } = {},
): Promise<{ refund: { id: number; status: string } }> {
  return request(`/refunds/${id}/approve`, { method: "POST", body: JSON.stringify(payload) });
}

export async function resendRefundOtp(id: number): Promise<{ message?: string }> {
  return request(`/refunds/${id}/resend-otp`, { method: "POST", body: JSON.stringify({}) });
}

export async function rejectRefund(
  id: number,
  rejection_reason: string,
): Promise<{ refund: { id: number; status: string } }> {
  return request(`/refunds/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ rejection_reason }),
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

// ── Stock count sessions ─────────────────────────────────────────────────────
//
// A stocktake is a session, not a form. The expected quantity is snapshotted
// when the sheet opens and is NOT in these payloads while it is open — that is
// the point of counting blind, and it is enforced server-side, so there is
// nothing here to accidentally render.

export type StockCountStatus = "open" | "submitted" | "posted" | "cancelled";

export type StockCountSession = {
  id: number;
  reference: string;
  status: StockCountStatus;
  note: string | null;
  opened_at: string;
  submitted_at: string | null;
  posted_at: string | null;
  opener?: { id: number; name: string } | null;
  submitter?: { id: number; name: string } | null;
  category?: { id: number; name: string } | null;
};

export type StockCountLine = {
  id: number;
  inventory_item_id: number;
  name: string | null;
  unit: string | null;
  sku: string | null;
  counted_qty: number | null;
  note: string | null;
  counted_at: string | null;
  /** Review-only: absent entirely while the sheet is open. */
  snapshot_qty?: number;
  variance?: number | null;
  variance_value_mvr?: number | null;
  needs_reason?: boolean;
};

export type StockCountPayload = {
  session: StockCountSession | null;
  lines?: StockCountLine[];
  can_review?: boolean;
  variance_value_mvr?: number | null;
};

export async function fetchActiveStockCount(): Promise<StockCountPayload> {
  return request("/stock-counts/active");
}

export async function openStockCount(payload: {
  inventory_category_id?: number | null;
  note?: string;
}): Promise<StockCountPayload> {
  return request("/stock-counts", { method: "POST", body: JSON.stringify(payload) });
}

export async function saveStockCounts(
  sessionId: number,
  entries: Array<{ line_id: number; counted_qty: number | null; note?: string }>,
): Promise<StockCountPayload> {
  return request(`/stock-counts/${sessionId}/counts`, {
    method: "POST",
    body: JSON.stringify({ entries }),
  });
}

export async function submitStockCount(sessionId: number): Promise<StockCountPayload> {
  return request(`/stock-counts/${sessionId}/submit`, { method: "POST" });
}

export async function postStockCount(sessionId: number): Promise<StockCountPayload> {
  return request(`/stock-counts/${sessionId}/post`, { method: "POST" });
}

export async function reopenStockCount(sessionId: number, note?: string): Promise<StockCountPayload> {
  return request(`/stock-counts/${sessionId}/reopen`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export async function cancelStockCount(sessionId: number): Promise<StockCountPayload> {
  return request(`/stock-counts/${sessionId}/cancel`, { method: "POST" });
}
