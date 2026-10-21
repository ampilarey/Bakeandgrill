import type { RestaurantTable } from "../types";

/** True when an open check owns this seat (prefer order link over status cache). */
export function tableIsInUse(table: RestaurantTable): boolean {
  return table.current_order_id != null || table.status === "occupied";
}

/**
 * A number stand for self-seating dine-in (owner, 2026-10-22: "here people
 * sit on their own"): a table row of kind "stand", named "No. 12", handed
 * over at the counter so the runner finds the customer wherever they sat.
 */
export function isStand(table: RestaurantTable): boolean {
  return table.kind === "stand";
}

export function standNumber(table: RestaurantTable): number {
  return Number(String(table.name).replace(/\D+/g, "")) || 0;
}

/** The real tables on the floor, number stands left out. */
export function realTables(tables: RestaurantTable[]): RestaurantTable[] {
  return tables.filter((t) => !isStand(t));
}

/** Number stands nobody holds, lowest number first; a retired stand is never offered. */
export function freeStands(tables: RestaurantTable[]): RestaurantTable[] {
  return tables
    .filter((t) => isStand(t) && t.is_active !== false && !tableIsInUse(t) && t.status !== "reserved" && t.status !== "closed")
    .sort((a, b) => standNumber(a) - standNumber(b));
}

/** The number the till gives a dine-in ticket that has no table: the lowest free one. */
export function lowestFreeStand(tables: RestaurantTable[]): RestaurantTable | null {
  return freeStands(tables)[0] ?? null;
}

export function tableNameOf(tables: RestaurantTable[], id: number | null | undefined): string | null {
  if (id == null) return null;
  return tables.find((t) => t.id === id)?.name ?? null;
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
