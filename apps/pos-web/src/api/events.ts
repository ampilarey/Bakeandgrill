import { ApiRequestError, request } from "./client";

export type PosEventLine = {
  id: number;
  name: string;
  quantity: number;
  unit_price: number | null;
  is_custom: boolean;
  notes: string | null;
};

export type PosEventOrder = {
  id: number;
  order_number: string | null;
  status: string;
  fired_at: string | null;
  payment_status: string | null;
  payment_state: "paid" | "partial" | "pending" | "none";
  paid_laar: number;
  balance_laar: number;
  total_laar: number;
};

export type PosEvent = {
  id: number;
  reference: string | null;
  status: string;
  display_status: string;
  contact_name: string;
  phone: string;
  event_date: string | null;
  fulfillment_method: string;
  fulfillment_time: string | null;
  setup_time: string | null;
  venue_name: string | null;
  delivery_address: string | null;
  delivery_island: string | null;
  headcount: number | null;
  dietary_notes: string | null;
  handled_by: { id: number; name: string } | null;
  lines: PosEventLine[];
  order: PosEventOrder | null;
  quote_is_deposit: boolean;
  quote_payment_laar: number | null;
};

export type PosEventsResponse = {
  events: PosEvent[];
  meta: { from: string; to: string; today: string };
};

export type FireShortage = {
  item_name: string;
  order_item_id: number;
  requested: number;
  available: number | null;
  reason: string;
};

export async function fetchPosEvents(params?: {
  from?: string;
  to?: string;
  status?: string;
}): Promise<PosEventsResponse> {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  if (params?.status) q.set("status", params.status);
  const suffix = q.toString() ? `?${q}` : "";
  return request<PosEventsResponse>(`/pos/events${suffix}`);
}

export async function firePosEvent(
  id: number,
  confirmShortages = false,
): Promise<{
  message: string;
  already_fired?: boolean;
  requires_confirmation?: boolean;
  shortages?: FireShortage[];
  event?: PosEvent;
}> {
  try {
    return await request(`/pos/events/${id}/fire`, {
      method: "POST",
      body: JSON.stringify({ confirm_shortages: confirmShortages }),
    });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 409 && e.body && typeof e.body === "object") {
      const body = e.body as {
        message?: string;
        requires_confirmation?: boolean;
        shortages?: FireShortage[];
      };
      return {
        message: body.message ?? e.message,
        requires_confirmation: true,
        shortages: body.shortages ?? [],
      };
    }
    throw e;
  }
}

export async function cancelPosEvent(id: number): Promise<{ message: string; event: PosEvent }> {
  return request(`/pos/events/${id}/cancel`, { method: "POST", body: "{}" });
}
