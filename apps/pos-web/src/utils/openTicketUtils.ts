import { isBusinessDateInFuture } from "@shared/utils/businessDay";
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

/**
 * Kitchen lifecycle stage — aligned with KDS columns (Pending / Cooking / Ready),
 * plus "tomorrow" for paid collect-tomorrow tickets waiting on a future day.
 *
 * Handover: Tomorrow → Parked (collection morning) → Cooking → Ready.
 */
export type TicketStage = "tomorrow" | "parked" | "queued" | "cooking" | "ready";

export type TicketStageInput = {
  status?: string | null;
  fired_at?: string | null;
  fulfil_date?: string | null;
};

export function ticketStage(
  statusOrTicket: string | null | undefined | TicketStageInput,
  maybeFiredAt?: string | null,
  maybeFulfilDate?: string | null,
  now: Date = new Date(),
): TicketStage {
  let status: string | null | undefined;
  let firedAt: string | null | undefined;
  let fulfilDate: string | null | undefined;

  if (statusOrTicket && typeof statusOrTicket === "object") {
    status = statusOrTicket.status;
    firedAt = statusOrTicket.fired_at;
    fulfilDate = statusOrTicket.fulfil_date;
  } else {
    status = statusOrTicket;
    firedAt = maybeFiredAt;
    fulfilDate = maybeFulfilDate;
  }

  // Collect-tomorrow: own stage until the restaurant's collection day begins.
  if (fulfilDate && !firedAt) {
    if (isBusinessDateInFuture(fulfilDate, now)) return "tomorrow";
    return "parked";
  }
  if (status === "held") return "parked";
  if (status === "ready") return "ready";
  if (status === "in_progress" || status === "preparing") return "cooking";
  // KDS Pending column: paid online orders + POS tickets fired but not started.
  if (status === "pending" || status === "paid") return "queued";
  return "cooking";
}
