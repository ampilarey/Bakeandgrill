/**
 * Where an order came from, and how to say so on a ticket.
 *
 * `type` does not answer this. A cashier picking "Pickup" on the till creates
 * type `online_pickup` (mapPosOrderType in hooks/useCart.ts), so type alone
 * counts staff tickets as online orders — which is exactly what the "Online"
 * tab used to do.
 *
 * `user_id` is the signal: the server stamps the cashier on anything rung on
 * a till and never sets it for the customer app. The API now says so directly
 * via `is_customer_placed`; the type + user-id form stays as the fallback for
 * payloads that predate it (an offline queue flushed after an upgrade, a
 * cached response).
 */

/**
 * True when a customer placed this themselves, rather than a cashier.
 *
 * Takes no `type` any more, and that is the point: origin and fulfilment are
 * separate questions. The old signature took one and restricted the answer to
 * online_pickup/delivery, which is what made a dine-in order placed in the app
 * read as staff-rung.
 */
export function isCustomerAppOrder(
  staffUserId?: number | null,
  isCustomerPlaced?: boolean | null,
): boolean {
  // The server already decided. Note the explicit null/undefined check —
  // `isCustomerPlaced ?? fallback` would be right, but `if (x)` would treat a
  // legitimate `false` as "not told" and fall through to the guess.
  if (isCustomerPlaced === true || isCustomerPlaced === false) {
    return isCustomerPlaced;
  }
  // Older payload. Deliberately not restricted to online_pickup/delivery any
  // more: a dine-in order placed in the app has no cashier either, and
  // treating it as staff-rung is how it stayed invisible in the Online tab.
  return staffUserId == null || staffUserId === 0;
}

/** Human-readable fulfillment labels for POS ticket rows and cart. */
export function posOrderTypeLabel(
  type: string | null | undefined,
  staffUserId?: number | null,
  isCustomerPlaced?: boolean | null,
): string | null {
  if (!type) return null;
  const online = isCustomerAppOrder(staffUserId, isCustomerPlaced);
  const map: Record<string, string> = {
    dine_in: "Dine-in",
    takeaway: "Takeaway",
    delivery: "Delivery",
    online_pickup: online ? "Online Pickup" : "Pickup",
  };
  return map[type] ?? type;
}

export function posOrderTypeEmoji(
  type: string | null | undefined,
  staffUserId?: number | null,
  isCustomerPlaced?: boolean | null,
): string {
  if (type === "online_pickup") {
    return isCustomerAppOrder(staffUserId, isCustomerPlaced) ? "📦" : "🥡";
  }
  switch (type) {
    case "delivery": return "🛵";
    case "takeaway": return "🥡";
    case "dine_in": return "🍽";
    default: return "📋";
  }
}

/**
 * The badge that marks origin on a ticket row.
 *
 * The word "Online" tucked into the type label only ever distinguished
 * `online_pickup`. A customer delivery and a phoned-in delivery both read
 * "🛵 Delivery", and the same for dine-in — nothing a cashier could scan
 * mid-service. Every ticket now carries one of these two.
 */
export type OrderOriginBadge = {
  label: string;
  short: string;
  title: string;
  /** Matches the palette keys used by the stage badges on the same row. */
  tone: "online" | "staff";
};

export function orderOriginBadge(
  staffUserId?: number | null,
  isCustomerPlaced?: boolean | null,
  staffName?: string | null,
): OrderOriginBadge {
  if (isCustomerAppOrder(staffUserId, isCustomerPlaced)) {
    return {
      label: "Online",
      short: "Online",
      title: "Placed by the customer in the ordering app",
      tone: "online",
    };
  }
  return {
    label: staffName ? `Staff · ${staffName}` : "Staff",
    short: "Staff",
    title: staffName ? `Rung up on the till by ${staffName}` : "Rung up on the till",
    tone: "staff",
  };
}
