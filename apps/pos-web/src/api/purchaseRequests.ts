import { request } from "./client";

// ── Purchase requests ─────────────────────────────────────────────────────────

export type PosPurchaseRequestItem = {
  id: number;
  name: string;
  requested_qty: number;
  requested_unit: string;
  approved_qty: number | null;
  actual_qty: number | null;
  actual_unit: string | null;
  status: string;
  notes: string | null;
  buyer_notes: string | null;
  price_hint?: {
    last_paid: number | null;
    cheapest: { supplier_id: number; supplier_name: string | null; unit_price: number } | null;
  };
};

export type PosPurchaseRequest = {
  id: number;
  request_no: string;
  title: string | null;
  status: string;
  priority: string;
  needed_by: string | null;
  notes: string | null;
  items: PosPurchaseRequestItem[];
};

export type PurchaseRequestLineInput = {
  inventory_item_id?: number;
  menu_item_id?: number;
  free_text_name?: string;
  category?: string;
  requested_qty: number;
  requested_unit: string;
  reason?: "low_stock" | "finished" | "damaged" | "urgent_order" | "packaging" | "cleaning" | "gas" | "other";
  notes?: string;
};

export async function createPurchaseRequest(payload: {
  source: "pos" | "kds" | "admin";
  title?: string;
  priority?: "low" | "normal" | "urgent";
  needed_by?: string;
  notes?: string;
  items: PurchaseRequestLineInput[];
}): Promise<{ request: PosPurchaseRequest }> {
  return request("/purchase-requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchMyPurchaseRequests(): Promise<{ data: PosPurchaseRequest[] }> {
  return request("/purchase-requests/my");
}

export async function fetchAssignedPurchaseRequests(): Promise<{ data: PosPurchaseRequest[] }> {
  return request("/purchase-requests/assigned-to-me");
}

export async function cancelPurchaseRequest(id: number): Promise<{ request: PosPurchaseRequest }> {
  return request(`/purchase-requests/${id}/cancel`, { method: "POST" });
}

export async function markPurchaseRequestItemBought(
  requestId: number,
  itemId: number,
  payload: {
    actual_qty?: number;
    actual_unit?: string;
    actual_unit_cost_laar?: number;
    supplier_name_text?: string;
    buyer_notes?: string;
  },
): Promise<{ item: PosPurchaseRequestItem; request: PosPurchaseRequest }> {
  return request(`/purchase-requests/${requestId}/items/${itemId}/mark-bought`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function markPurchaseRequestItemPartial(
  requestId: number,
  itemId: number,
  payload: {
    actual_qty: number;
    actual_unit?: string;
    actual_unit_cost_laar?: number;
    supplier_name_text?: string;
    buyer_notes?: string;
  },
): Promise<{ item: PosPurchaseRequestItem; request: PosPurchaseRequest }> {
  return request(`/purchase-requests/${requestId}/items/${itemId}/mark-partial`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function markPurchaseRequestItemNotAvailable(
  requestId: number,
  itemId: number,
  buyerNotes?: string,
): Promise<{ item: PosPurchaseRequestItem; request: PosPurchaseRequest }> {
  return request(`/purchase-requests/${requestId}/items/${itemId}/mark-not-available`, {
    method: "POST",
    body: JSON.stringify({ buyer_notes: buyerNotes }),
  });
}

export async function uploadPurchaseRequestAttachment(
  requestId: number,
  file: File,
  type: "request_photo" | "receipt" | "delivery_note" | "other",
  itemId?: number,
): Promise<{ attachment: { id: number; url: string } }> {
  const form = new FormData();
  form.append("file", file);
  form.append("type", type);
  if (itemId != null) form.append("purchase_request_item_id", String(itemId));
  return request(`/purchase-requests/${requestId}/attachments`, {
    method: "POST",
    body: form,
  });
}
