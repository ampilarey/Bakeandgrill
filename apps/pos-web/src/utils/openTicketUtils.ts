import { fetchReceipts } from "../api";

export type OpenTicket = Awaited<ReturnType<typeof fetchReceipts>>["data"][number];

/**
 * Robust money display for a ticket.
 *
 * The backend `total` column drifts to 0 in several edge cases we've
 * had to firefight — orders created via legacy paths, orders saved
 * before `OrderTotalsCalculator` was wired into every code path, and
 * any future race where the order is created before items are
 * persisted. When that happens the cashier sees "MVR 0.00" on a
 * ticket that clearly has items, which destroys trust in the panel.
 *
 * Falls back to summing line-item `total_price` when the persisted
 * `total` is 0 or missing. Items are eager-loaded by the API so the
 * data is already on the row — no extra request, no flicker.
 *
 * Laravel's `decimal:2` cast returns money values as strings (e.g.
 * `"50.00"`), so every field has to go through `Number()` before any
 * arithmetic or `.toFixed()` call to avoid `NaN` (Bug-053 / Bug-055).
 */
export function ticketDisplayTotal(t: OpenTicket): number {
  const stored = Number(t.total ?? 0);
  if (stored > 0) return stored;
  const items = t.items ?? [];
  const summed = items.reduce(
    (sum, it) => sum + Number(it.total_price ?? 0),
    0,
  );
  return summed > 0 ? summed : stored;
}

/** Kitchen lifecycle stage — aligned with KDS columns (Pending / Cooking / Ready). */
export type TicketStage = "parked" | "queued" | "cooking" | "ready";

export function ticketStage(status: string | null | undefined): TicketStage {
  if (status === "held") return "parked";
  if (status === "ready") return "ready";
  if (status === "in_progress" || status === "preparing") return "cooking";
  // KDS Pending column: paid online orders + POS tickets fired but not started.
  if (status === "pending" || status === "paid") return "queued";
  return "cooking";
}
