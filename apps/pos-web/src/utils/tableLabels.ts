import type { RestaurantTable } from "../types";

/** True when an open check owns this seat (prefer order link over status cache). */
export function tableIsInUse(table: RestaurantTable): boolean {
  return table.current_order_id != null || table.status === "occupied";
}

/** Dropdown / floor label: "T4 — Free" or "T4 — In use · Aisha". */
export function formatTableOption(
  table: RestaurantTable,
  opts?: { ourOrderId?: number | null },
): string {
  const ours = opts?.ourOrderId != null && table.current_order_id === opts.ourOrderId;
  if (ours) {
    return `${table.name} — This ticket`;
  }
  if (tableIsInUse(table)) {
    const label = table.current_order_label || table.current_order_number || "open";
    return `${table.name} — In use · ${label}`;
  }
  if (table.status === "reserved") return `${table.name} — Reserved`;
  if (table.status === "closed") return `${table.name} — Closed`;
  return `${table.name} — Free`;
}
