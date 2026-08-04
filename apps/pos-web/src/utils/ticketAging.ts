import {
  businessDayStartIso,
  formatBusinessDayLabel,
} from "@shared/utils/businessDay";
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

const AGE_LEVEL_RANK: Record<TicketAgeLevel, number> = {
  critical: 0,
  warn: 1,
  ok: 2,
};

type AgeFields = {
  held_at?: string | null;
  fired_at?: string | null;
  created_at?: string | null;
  status?: string;
  fulfil_date?: string | null;
};

/** Sort critical → warn → ok, then older first within the same level. */
export function compareTicketsByAge(
  a: AgeFields & { status: string },
  b: AgeFields & { status: string },
  stageOf: (ticket: AgeFields & { status: string }) => TicketStage,
): number {
  const stageA = stageOf(a);
  const stageB = stageOf(b);
  const levelA = ticketAgeLevel(ticketAgeAnchor(a, stageA), stageA);
  const levelB = ticketAgeLevel(ticketAgeAnchor(b, stageB), stageB);
  const rankDiff = AGE_LEVEL_RANK[levelA] - AGE_LEVEL_RANK[levelB];
  if (rankDiff !== 0) return rankDiff;
  const tA = Date.parse(ticketAgeAnchor(a, stageA) ?? "") || 0;
  const tB = Date.parse(ticketAgeAnchor(b, stageB) ?? "") || 0;
  return tA - tB; // older first
}

/**
 * Prefer hold time for parked tickets; fire time for kitchen stages.
 * Collect-tomorrow tickets on collection day age from the start of that
 * business day — not from when the order was placed the evening before.
 */
export function ticketAgeAnchor(ticket: AgeFields, stage: TicketStage): string | null {
  if (stage === "tomorrow") {
    // Future start-of-day keeps these from floating above same-day "ok" tickets.
    return ticket.fulfil_date ? businessDayStartIso(ticket.fulfil_date) : null;
  }
  if (stage === "parked") {
    if (ticket.fulfil_date && !ticket.fired_at) {
      return businessDayStartIso(ticket.fulfil_date);
    }
    return ticket.held_at ?? ticket.created_at ?? null;
  }
  return ticket.fired_at ?? ticket.created_at ?? null;
}

function minutesSince(iso: string | null | undefined, nowMs: number = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((nowMs - t) / 60000);
}

/** Parked/held tickets: warn at 15m, critical at 30m. */
export function parkedTicketAgeLevel(
  iso: string | null | undefined,
  nowMs: number = Date.now(),
): TicketAgeLevel {
  const m = minutesSince(iso, nowMs);
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

export function ticketAgeLevel(
  iso: string | null | undefined,
  stage: TicketStage,
  nowMs: number = Date.now(),
): TicketAgeLevel {
  if (stage === "tomorrow") return "ok";
  if (stage === "parked") return parkedTicketAgeLevel(iso, nowMs);
  if (stage === "ready") return readyTicketAgeLevel(iso);
  return kitchenTicketAgeLevel(iso);
}

export function ticketAgeTitle(
  level: TicketAgeLevel,
  stage: TicketStage,
  opts?: { fulfil_date?: string | null },
): string {
  if (stage === "tomorrow") {
    const day = opts?.fulfil_date
      ? formatBusinessDayLabel(opts.fulfil_date)
      : "collection day";
    return `Waiting for ${day} — nothing to do yet`;
  }
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
