import { request } from "./client";
import type { PosCustomer } from "./customers";

export async function createOrder(payload: {
  type: string;
  print?: boolean;
  device_identifier?: string;
  restaurant_table_id?: number | null;
  customer_id?: number | null;
  discount_amount?: number;
  discount_reason?: string;
  discount_reason_note?: string;
  /** Per-charge UUID — server returns the existing order on retry. */
  idempotency_key?: string;
  ticket_name?: string;
  ticket_note?: string;
  items: Array<{
    item_id?: number | null;
    name: string;
    quantity: number;
    variant_id?: number | null;
    modifiers?: Array<{
      modifier_id?: number | null;
      name: string;
      price: number;
    }>;
    notes?: string;
  }>;
}): Promise<{ order: { id: number; total: number } }> {
  return request("/orders", { method: "POST", body: JSON.stringify(payload) });
}

export async function createDeliveryOrder(payload: {
  print?: boolean;
  device_identifier?: string;
  customer_id?: number | null;
  discount_amount?: number;
  discount_reason?: string;
  discount_reason_note?: string;
  idempotency_key?: string;
  ticket_name?: string;
  ticket_note?: string;
  delivery_address_line1: string;
  delivery_address_line2?: string;
  delivery_island: string;
  delivery_contact_name: string;
  delivery_contact_phone: string;
  delivery_notes?: string;
  delivery_location_link?: string;
  items: Array<{
    item_id?: number | null;
    name: string;
    quantity: number;
    variant_id?: number | null;
    modifiers?: Array<{
      modifier_id?: number | null;
      name: string;
      price: number;
    }>;
    notes?: string;
  }>;
}): Promise<{ order: { id: number; total: number; delivery_fee?: number } }> {
  return request("/orders/delivery", { method: "POST", body: JSON.stringify(payload) });
}
/** Minimal "incoming online order" record used by the new-order toast.
 *  Only the fields the cashier actually needs in the corner toast — full
 *  order detail is fetched on demand when they click through. */
export type IncomingOnlineOrder = {
  id: number;
  order_number: string;
  type: string;
  status: string;
  total: number;
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string;
};

/**
 * Fetch recent online orders (pickup + delivery) for the toast watcher.
 * After BML payment, online orders move to `pending` with
 * payment_status=paid — not status=paid.
 */
export async function fetchRecentOnlineOrders(limit = 10): Promise<IncomingOnlineOrder[]> {
  const res = await request<{
    data: Array<{
      id: number;
      order_number: string;
      type: string;
      status: string;
      total: number | string;
      created_at: string;
      customer?: { name?: string | null; phone?: string | null } | null;
    }>;
  }>(
    `/orders?online_only=1&status=pending,in_progress,preparing,ready&per_page=${limit}`,
  );
  return (res.data ?? []).map((o) => ({
    id: o.id,
    order_number: o.order_number,
    type: o.type,
    status: o.status,
    total: Number(o.total),
    customer_name: o.customer?.name ?? null,
    customer_phone: o.customer?.phone ?? null,
    created_at: o.created_at,
  }));
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
      variant_id?: number | null;
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
      /** FIX 11: cash overpay — optional, must be ≥ amount on cash rows. */
      tendered_amount?: number;
      status?: string;
      reference_number?: string;
      idempotency_key?: string;
    }>;
    print_receipt?: boolean;
  }
): Promise<{
  order: { id: number; total: number };
  paid_total: number;
  /**
   * FIX 9e — optional post-settle credit balance for the ticket's
   * attached customer, in whole MVR. Present when the payment rows
   * include a `house_account` leg and the backend has been updated
   * to echo the new balance. Older backends omit the field; callers
   * must treat it as best-effort.
   */
  credit_balance_mvr?: number | null;
}> {
  return request(`/orders/${orderId}/payments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getOrder(orderId: number): Promise<{
  order: {
    id: number;
    order_number?: string | null;
    // Server-authoritative totals — see POS-004. We surface `total`
    // here so handleResumeTicket can snapshot the figure the kitchen
    // and accounting already agreed on, instead of re-deriving it
    // from local cart math.
    total?: number;
    subtotal?: number;
    tax_amount?: number;
    status?: string;
    /** Ringing channel ("dine_in" | "takeaway" | "online_pickup" | ...).
     *  Surfaced here so handleResumeTicket can restore the cashier's
     *  pill selection on resume — otherwise a held Dine-in ticket
     *  came back as the default Takeaway/Dine-in and the Charge step
     *  silently re-routed it. */
    type?: string;
    /** Same story for the table the ticket was rung against. */
    restaurant_table_id?: number | null;
    /** Financial state — independent of `status`. Set to 'paid' the
     *  moment payments cover the total (either via /payments or
     *  via the BML webhook for an online pay-link redemption). The
     *  resume flow checks this to detect "customer paid online
     *  while ticket was open" and short-circuits Charge → Receipt. */
    payment_status?: "unpaid" | "partial" | "paid" | null;
    /** Manual cashier-applied discount (MVR amount). Hydrated on resume
     *  so the cart sidebar shows the same discount line the cashier
     *  applied when the ticket was held. */
    discount_amount?: number | string | null;
    /** Manual discount in laari — preferred for resume dirty-check baseline. */
    manual_discount_laar?: number | null;
    /** Gift card code applied to the ticket + the laari value redeemed.
     *  Surface both so resume can re-paint the rewards row without an
     *  extra round-trip to validate the code. */
    gift_card_code?: string | null;
    /** Masked gift card code returned after hashing migration (no plaintext). */
    gift_card_masked?: string | null;
    gift_card_discount_laar?: number | null;
    /** Loyalty laari held against the ticket — non-null when the
     *  cashier redeemed points before holding. Used to repaint the
     *  rewards strip without re-requesting a fresh hold. */
    loyalty_discount_laar?: number | null;
    /** Promo discount applied (laari) — surfaces same as above for
     *  the promo row. The promo CODE itself isn't stored on the order
     *  (lives in the redemption table), so the cart shows "Promo: -MVR x"
     *  without the code text. */
    promo_discount_laar?: number | null;
    /** Customer linked to the ticket when it was held, so the picker
     *  re-attaches them on resume and the bill SMS still goes to the
     *  right phone. Null/undefined for walk-in tickets. */
    customer?: PosCustomer | null;
    /** Staff cashier who rang the ticket — null for customer-app orders. */
    user_id?: number | null;
    user?: { id: number; name?: string | null } | null;
    items: Array<{
      item_id: number | null;
      item_name: string;
      variant_id?: number | null;
      variant_name?: string | null;
      unit_price: number;
      quantity: number;
      /** Legacy percent snapshot — POS GST math prefers tax_code. */
      tax_rate?: number | string | null;
      tax_code?: string | null;
      packaging_fee?: number | null;
      packaging_fee_mode?: "per_unit" | "per_line" | null;
      packaging_option_id?: number | null;
      packaging_option_name?: string | null;
      /** Free-form kitchen note (e.g. "No salt · Extra spicy"). The
       *  POS joins selected quick-note chips with " · " before saving;
       *  on resume we split back on " · " so the chip picker shows
       *  the same selections the cashier originally made. */
      notes?: string | null;
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

export async function holdOrder(
  orderId: number,
  payload?: { ticket_name?: string; ticket_note?: string },
): Promise<void> {
  await request(`/orders/${orderId}/hold`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export async function resumeOrder(orderId: number): Promise<void> {
  await request(`/orders/${orderId}/resume`, { method: "POST" });
}

/**
 * Phone-call pickup workflow: cashier picks "Save & Fire" in the
 * Save modal → POS creates the order normally (kitchen prints
 * because print:true is the default), but for held tickets the
 * cashier later wants to fire we hit this endpoint instead of
 * resume + charge. Transitions held → pending, fires kitchen
 * print, sends "Order received" SMS to the customer.
 *
 * Idempotent — calling on an already-fired order just refreshes
 * the kitchen print (cashier asked for a reprint).
 */
export async function fireOrderToKitchen(orderId: number): Promise<void> {
  await request(`/orders/${orderId}/fire-to-kitchen`, { method: "POST" });
}

/**
 * Send the customer a BML Connect pay link by SMS for the remaining
 * balance on this order. Powers the "Send pay link" button on the
 * Open Tickets row. The backend computes the outstanding amount
 * (order total minus any cash/card already taken) so it works for
 * split-tender scenarios too.
 *
 * Returns the amount that was charged on the link so the toast
 * can confirm "Pay link sent for MVR X.XX to +9607...".
 */
export async function sendPayLink(
  orderId: number,
  phone?: string,
): Promise<{ message: string; amount: number; sent_to: string }> {
  const body = phone ? { phone } : {};
  return request(`/orders/${orderId}/send-pay-link`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Cashier-callable lifecycle bumps — let a cashier-only setup move a
 * pickup order through "ready → completed" without needing a KDS
 * terminal in the kitchen. The backend reuses the same state
 * transitions KDS uses, so the existing "Ready for pickup!" SMS
 * still fires once on transition to ready, and OrderCompleted +
 * loyalty awards still fire on transition to completed.
 *
 * `markPickedUp` is guarded server-side: it refuses to close an
 * unpaid order. Take payment first (cash, card, transfer, QR, or Send pay link)
 * before tapping "Picked up".
 *
 * The {unchanged: true} return flag distinguishes a real transition
 * from a no-op (e.g. cashier double-tapped) so the UI can suppress
 * a duplicate toast.
 */
/** POS "Start cooking" — pending/paid → in_progress (KDS Pending → Cooking). */
export async function startOrderCooking(
  orderId: number,
): Promise<{ order: { id: number; status: string }; unchanged: boolean }> {
  return request(`/orders/${orderId}/start-cooking`, { method: "POST" });
}

export async function markOrderReady(
  orderId: number,
): Promise<{ order: { id: number; status: string }; unchanged: boolean }> {
  return request(`/orders/${orderId}/mark-ready`, { method: "POST" });
}

export async function markOrderPickedUp(
  orderId: number,
): Promise<{ order: { id: number; status: string }; unchanged: boolean }> {
  return request(`/orders/${orderId}/mark-picked-up`, { method: "POST" });
}

/**
 * Void a non-terminal ticket from the POS Active Orders panel.
 *
 * Backend:
 *  - refuses paid / completed / refunded / partially_refunded (use refund flow)
 *  - returns deducted POS stock to the shelves (idempotent)
 *  - releases promo / loyalty / gift-card holds via OrderCancelled event
 *  - frees the dine-in table if no other active order sits on it
 *  - audit-logs the cashier + reason
 *
 * `reason` is a short free-form note ("Customer changed mind", "Walked
 * out", "Wrong items") capped at 255 chars on the server. Required.
 */
export async function cancelOrder(
  orderId: number,
  reason: string,
): Promise<{ order: { id: number; status: string }; unchanged: boolean }> {
  return request(`/orders/${orderId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/**
 * Replace the line items on an existing (non-completed) order. Used by
 * the POS "Save changes" button when the cashier edited a resumed
 * active ticket. Backend wipes existing items, re-adds the payload,
 * recalculates totals via OrderTotalsCalculator, and optionally
 * reprints the kitchen chit.
 *
 * Refuses paid / completed / cancelled / refunded orders server-side.
 */
export async function updateOrderItems(
  orderId: number,
  payload: {
    items: Array<{
      item_id?: number | null;
      name: string;
      quantity: number;
      variant_id?: number | null;
      packaging_option_id?: number | null;
      notes?: string;
      modifiers?: Array<{
        modifier_id?: number | null;
        name: string;
        price: number;
      }>;
    }>;
    reprint_kitchen?: boolean;
    /** Persist fulfillment change (e.g. dine_in → takeaway) with Save changes. */
    type?: "dine_in" | "takeaway" | "online_pickup" | "delivery";
    restaurant_table_id?: number | null;
    delivery_address_line1?: string | null;
    delivery_address_line2?: string | null;
    delivery_island?: string | null;
    delivery_contact_name?: string | null;
    delivery_contact_phone?: string | null;
    delivery_notes?: string | null;
    delivery_location_link?: string | null;
    /** Manual cashier discount in MVR — persisted as manual_discount_laar. */
    discount_amount?: number;
    discount_reason?: string;
    discount_reason_note?: string;
  },
): Promise<{
  order: {
    id: number;
    total: number;
    subtotal: number;
    tax_amount: number;
    type?: string;
    restaurant_table_id?: number | null;
    delivery_address_line1?: string | null;
    delivery_island?: string | null;
  };
}> {
  return request(`/orders/${orderId}/items`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/** Request an SMS OTP for a manual discount (when approval_required). */
export async function requestDiscountApproval(
  orderId: number,
  payload: {
    discount_amount: number;
    discount_reason?: string;
    discount_reason_note?: string;
  },
): Promise<{ approval_id: number }> {
  return request(`/orders/${orderId}/discount/request-approval`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Confirm a discount approval OTP and apply the discount. */
export async function confirmDiscountApproval(
  orderId: number,
  payload: {
    approval_id: number;
    code: string;
    discount_amount?: number;
  },
): Promise<{ order: { id: number; total: number; subtotal?: number; tax_amount?: number } }> {
  return request(`/orders/${orderId}/discount/confirm`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Merge a source ticket into a target ticket. Items from `source_id`
 * are reparented onto `targetOrderId`; source is cancelled. Use when
 * the cashier consolidates two phone-call tickets or joins two table
 * parties. Server refuses if either order is paid/completed.
 */
export async function mergeOpenTickets(
  targetOrderId: number,
  payload: { source_id: number },
): Promise<{ order: { id: number; total: number } }> {
  return request(`/orders/${targetOrderId}/merge`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Split selected item ids off the source ticket into a brand-new
 * ticket. Useful when a customer wants to pay for only part of an
 * order (split bill on a phone-call pickup, or a dine-in party
 * splitting). Server returns both the slimmed-down source and the
 * brand-new split.
 */
export async function splitOpenTicket(
  sourceOrderId: number,
  payload: { item_ids: number[] },
): Promise<{
  source: { id: number; total: number };
  split: { id: number; total: number };
}> {
  return request(`/orders/${sourceOrderId}/split`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export async function fetchReceipts(params: {
  q?: string;
  date?: string;
  current_shift?: boolean;
  held_only?: boolean;
  /** Held OR fired-but-unpaid. Legacy — kept for callers that
   *  specifically want the narrower view (e.g. an end-of-shift
   *  "what's still owed me" check). */
  open_only?: boolean;
  /** Active Orders feed — non-terminal tickets that still need cashier
   *  action. Paid dine-in/takeaway are excluded (Receipts only); paid
   *  pickup/delivery stay until picked up or delivered. */
  active_only?: boolean;
  /** Manager view — surface anything cooking with a balance. */
  unpaid_only?: boolean;
  /** Active orders created by the logged-in cashier only. */
  created_by_me?: boolean;
  /** Active orders from the online ordering app (pickup + delivery). */
  online_only?: boolean;
  device_identifier?: string;
  per_page?: number;
  page?: number;
  status?: string;
  /** Restrict receipts to a specific shift. Used by ReceiptsPanel's
   *  "current shift" scope so the cashier sees only their own
   *  shift's sales, not the previous staffer's. Bug-046: this was
   *  previously cast through `unknown` to bypass the missing prop
   *  on this type — now properly declared. */
  shift_id?: number | string;
  /** Skip per-row payment_settlement on list polls. */
  slim?: boolean;
} = {}): Promise<{
  data: Array<{
    id: number;
    order_number: string;
    type: string;
    status: string;
    /** New: 'unpaid' | 'partial' | 'paid'. Independent of `status`,
     *  set by addPayments / BML webhook. Lets Open Tickets show an
     *  UNPAID badge without recomputing payments per row. */
    payment_status?: "unpaid" | "partial" | "paid" | null;
    /** New: timestamp the kitchen first saw the chit. NULL means
     *  the ticket is still parked (Save Ticket without Fire). */
    fired_at?: string | null;
    /** Collect-tomorrow date (Y-m-d). Null = same-day / legacy. */
    fulfil_date?: string | null;
    /** Set when cashier parks the ticket (status held). */
    held_at?: string | null;
    total: number;
    subtotal: number;
    discount_amount: number;
    created_at: string;
    customer?: { id: number; name?: string; phone?: string } | null;
    user?: { id: number; name?: string } | null;
    items?: Array<{ id: number; item_name: string; quantity: number; unit_price: number; total_price: number }>;
    ticket_name?: string | null;
    ticket_note?: string | null;
    /** Restaurant table the dine-in ticket was rung against. Surfaced
     *  here so the POS Active orders search can match on table name
     *  (e.g. cashier types "T4" → Table T4's open ticket bubbles
     *  up). Null/undefined for non-dine-in tickets. Relation method
     *  on the Order model is `table()`, so Laravel serialises it
     *  here as `table`. */
    restaurant_table_id?: number | null;
    table?: { id: number; name: string; location?: string | null } | null;
    delivery_island?: string | null;
    kitchen_done_at?: string | null;
    kitchen_handover_status?: string | null;
    pos_received_at?: string | null;
  }>;
  /** Laravel paginator fields — present on GET /orders list responses. */
  total?: number;
  last_page?: number;
  current_page?: number;
  per_page?: number;
}> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    qs.set(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
  });
  return request(`/orders?${qs.toString()}`);
}

/** Venue-wide active order count — matches OpenTicketsPanel default scope. */
export async function countActiveOrders(): Promise<number> {
  const res = await fetchReceipts({ active_only: true, slim: true, per_page: 1, page: 1 });
  return res.total ?? res.data?.length ?? 0;
}

/** Slim page of active orders for badge count + aging signals. */
export async function fetchActiveOrdersBadgeSample(): Promise<{
  count: number;
  rows: Awaited<ReturnType<typeof fetchReceipts>>["data"];
}> {
  const res = await fetchReceipts({ active_only: true, slim: true, per_page: 50, page: 1 });
  const rows = res.data ?? [];
  return { count: res.total ?? rows.length, rows };
}

async function fetchActiveOrderPages(
  baseParams: Record<string, string | number | boolean | undefined>,
): Promise<{
  data: Awaited<ReturnType<typeof fetchReceipts>>["data"];
  total: number;
}> {
  const perPage = 100;
  const first = await fetchReceipts({ ...baseParams, active_only: true, slim: true, per_page: perPage, page: 1 });
  const out: Awaited<ReturnType<typeof fetchReceipts>>["data"] = [...(first.data ?? [])];
  const total = first.total ?? out.length;
  const lastPage = Math.min(first.last_page ?? 1, 20);
  if (lastPage > 1) {
    const rest = await Promise.all(
      Array.from({ length: lastPage - 1 }, (_, i) =>
        fetchReceipts({ ...baseParams, active_only: true, slim: true, per_page: perPage, page: i + 2 }),
      ),
    );
    for (const res of rest) out.push(...(res.data ?? []));
  }
  return { data: out, total };
}

/** Active orders venue-wide (every station). Manager/owner scope. */
export async function fetchActiveOrdersVenueWide(): Promise<{
  data: Awaited<ReturnType<typeof fetchReceipts>>["data"];
  total: number;
}> {
  return fetchActiveOrderPages({});
}

/** Active orders created by the logged-in cashier only. */
export async function fetchActiveOrdersMine(): Promise<{
  data: Awaited<ReturnType<typeof fetchReceipts>>["data"];
  total: number;
}> {
  return fetchActiveOrderPages({ created_by_me: true });
}

/** Active online orders (ordering-app pickup + delivery). */
export async function fetchActiveOrdersOnline(): Promise<{
  data: Awaited<ReturnType<typeof fetchReceipts>>["data"];
  total: number;
}> {
  return fetchActiveOrderPages({ online_only: true });
}

/** Active orders for all in-flight venue tickets (staff default). */
export async function fetchActiveOrdersForCashier(): Promise<{
  data: Awaited<ReturnType<typeof fetchReceipts>>["data"];
  total: number;
}> {
  return fetchActiveOrdersVenueWide();
}

/** @deprecated Device scope removed — use fetchActiveOrdersMine instead. */
export async function fetchActiveOrdersForStation(
  _deviceIdentifier: string,
): Promise<{ data: Awaited<ReturnType<typeof fetchReceipts>>["data"]; total: number }> {
  return fetchActiveOrdersVenueWide();
}

export async function getReceiptLink(orderId: number): Promise<{ link: string }> {
  return request(`/orders/${orderId}/receipt-link`);
}

export async function sendReceipt(
  orderId: number,
  payload: { channel: "sms" | "email"; recipient: string },
): Promise<{ receipt: unknown; link: string }> {
  return request(`/receipts/${orderId}/send`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export async function sendBill(
  orderId: number,
  phone?: string,
): Promise<{ order: unknown; invoice: unknown; link: string }> {
  const body = phone ? { phone } : {};
  return request(`/orders/${orderId}/send-bill`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Link, change, or remove customer on an open order (paid pickup handover). */
export async function updateOrderCustomer(
  orderId: number,
  customerId: number | null,
): Promise<{ order: { customer?: PosCustomer | null } }> {
  return request(`/orders/${orderId}/customer`, {
    method: "PATCH",
    body: JSON.stringify({ customer_id: customerId }),
  });
}
