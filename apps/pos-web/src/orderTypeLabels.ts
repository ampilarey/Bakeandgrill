/** Human-readable fulfillment labels for POS ticket rows and cart. */
export function posOrderTypeLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  const map: Record<string, string> = {
    dine_in: "Dine-in",
    takeaway: "Takeaway",
    online_pickup: "Online Takeaway",
    delivery: "Delivery",
  };
  return map[type] ?? type;
}

export function posOrderTypeEmoji(type: string | null | undefined): string {
  switch (type) {
    case "online_pickup": return "📦";
    case "delivery": return "🛵";
    case "takeaway": return "🥡";
    case "dine_in": return "🍽";
    default: return "📋";
  }
}
