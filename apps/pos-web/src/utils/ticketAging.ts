import type { TicketStage } from "./openTicketUtils";

export function formatTicketAge(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export type TicketAgeLevel = "ok" | "warn" | "critical";

type AgeFields = {
  held_at?: string | null;
  fired_at?: string | null;
  created_at?: string | null;
};

/** Prefer hold time for parked tickets; fire time for kitchen stages. */
export function ticketAgeAnchor(ticket: AgeFields, stage: TicketStage): string | null {
  if (stage === "parked") {
    return ticket.held_at ?? ticket.created_at ?? null;
  }
  return ticket.fired_at ?? ticket.created_at ?? null;
}

function minutesSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 60000);
}

/** Parked/held tickets: warn at 15m, critical at 30m. */
export function parkedTicketAgeLevel(iso: string | null | undefined): TicketAgeLevel {
  const m = minutesSince(iso);
  if (m == null) return "ok";
  if (m >= 30) return "critical";
  if (m >= 15) return "warn";
  return "ok";
}

/** Kitchen queued/cooking: warn at 8m, critical at 15m (matches admin KDS). */
export function kitchenTicketAgeLevel(iso: string | null | undefined): TicketAgeLevel {
  const m = minutesSince(iso);
  if (m == null) return "ok";
  if (m >= 15) return "critical";
  if (m >= 8) return "warn";
  return "ok";
}

/** Ready-for-pickup: warn at 10m, critical at 20m. */
export function readyTicketAgeLevel(iso: string | null | undefined): TicketAgeLevel {
  const m = minutesSince(iso);
  if (m == null) return "ok";
  if (m >= 20) return "critical";
  if (m >= 10) return "warn";
  return "ok";
}

export function ticketAgeLevel(iso: string | null | undefined, stage: TicketStage): TicketAgeLevel {
  if (stage === "parked") return parkedTicketAgeLevel(iso);
  if (stage === "ready") return readyTicketAgeLevel(iso);
  return kitchenTicketAgeLevel(iso);
}

export function ticketAgeTitle(level: TicketAgeLevel, stage: TicketStage): string {
  if (stage === "parked") {
    if (level === "critical") return "Parked 30+ minutes — fire or void soon";
    if (level === "warn") return "Parked 15+ minutes";
    return "Time since ticket was parked";
  }
  if (stage === "ready") {
    if (level === "critical") return "Ready 20+ minutes — customer may be waiting";
    if (level === "warn") return "Ready 10+ minutes";
    return "Time since ticket was ready";
  }
  if (level === "critical") return "In kitchen 15+ minutes";
  if (level === "warn") return "In kitchen 8+ minutes";
  return "Time since ticket was fired / created";
}

export const PARKED_AGE_COLORS: Record<TicketAgeLevel, { color: string; bg: string; border: string }> = {
  ok: { color: "#64748B", bg: "#F8FAFC", border: "#E2E8F0" },
  warn: { color: "#C2410C", bg: "#FFF7ED", border: "#FDBA74" },
  critical: { color: "#B91C1C", bg: "#FEF2F2", border: "#FECACA" },
};

/** Alias kept for call sites that still import the parked palette name. */
export const TICKET_AGE_COLORS = PARKED_AGE_COLORS;
