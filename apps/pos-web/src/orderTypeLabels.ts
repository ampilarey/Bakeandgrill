/** True when the order came from the customer ordering app (not rung on POS). */
export function isCustomerAppOrder(
  type: string | null | undefined,
  staffUserId?: number | null,
): boolean {
  if (type !== "online_pickup" && type !== "delivery") return false;
  return staffUserId == null || staffUserId === 0;
}

/** Human-readable fulfillment labels for POS ticket rows and cart. */
export function posOrderTypeLabel(
  type: string | null | undefined,
  staffUserId?: number | null,
): string | null {
  if (!type) return null;
  if (type === "online_pickup") {
    return isCustomerAppOrder(type, staffUserId) ? "Online Takeaway" : "Pickup";
  }
  const map: Record<string, string> = {
    dine_in: "Dine-in",
    takeaway: "Takeaway",
    delivery: "Delivery",
  };
  return map[type] ?? type;
}

export function posOrderTypeEmoji(
  type: string | null | undefined,
  staffUserId?: number | null,
): string {
  if (type === "online_pickup") {
    return isCustomerAppOrder(type, staffUserId) ? "📦" : "🥡";
  }
  switch (type) {
    case "delivery": return "🛵";
    case "takeaway": return "🥡";
    case "dine_in": return "🍽";
    default: return "📋";
  }
}
